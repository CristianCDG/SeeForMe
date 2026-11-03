from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from openai import AuthenticationError, RateLimitError, APIConnectionError, APIStatusError
from config import get_settings
from auth import verify_api_key
from rate_limit import enforce_rate_limit
from meta_client import get_meta_client
from pydantic import BaseModel, Field, ValidationError, TypeAdapter
import base64
import json
import httpx

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["X-API-Key", "Content-Type"],
)
ALLOWED_TYPES = ["image/png", "image/gif", "image/webp", "image/jpeg"]
ALLOWED_AUDIO_TYPES = ["audio/wav", "audio/x-wav", "audio/wave"]
MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_HISTORY_TURNS = 6
RETAKE_MARKER = "[RETAKE]"
RETAKE_RULE = " If the photo is too blurry, too dark, or the object or document is cut off so that you cannot answer reliably, start your reply with the exact marker [RETAKE] followed by one short sentence telling the user how to move the phone, for example move it up, down, left or right, step back, or find more light. Otherwise never use that marker."
GUARDED = [Depends(verify_api_key), Depends(enforce_rate_limit)]


class Turn(BaseModel):
    question: str = Field(max_length=1000)
    answer: str = Field(max_length=4000)


history_adapter = TypeAdapter(list[Turn])
MODEL_INSTRUCTIONS = "You help a blind or low-vision user understand their surroundings. Reply in the language of the question. Use short, clear sentences. Mention the most important thing first. Only mention hazards you can clearly see in the image. Never say that a place, object, food or situation is safe, because a photo cannot guarantee that. Do not guess; if something is unclear, say so."

LOCATE_INSTRUCTIONS = "You guide a blind or low-vision user who is searching for an object by moving a phone camera. The user message names the target and attaches the latest camera frame. Reply with a single JSON object and nothing else, with the keys found (true or false) and guidance (a string). Set found to true only if the target is clearly visible, and then say where it is relative to the camera using words like left, right, up, down, near or far. If it is not clearly visible, set found to false and give one short instruction about how to move or turn the phone to keep searching. Write guidance in the language of the target. Use short sentences. Never say that a place or path is safe."


def image_data_url(image: UploadFile) -> str:
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Image is not of a supported type")
    data = image.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="The sent image exceeds maximum size defined")
    encoded = base64.b64encode(data).decode()
    return f"data:{image.content_type};base64,{encoded}"


def ask_meta(**kwargs):
    try:
        return get_meta_client().responses.create(**kwargs)
    except AuthenticationError:
        raise HTTPException(status_code=502, detail="Invalid Meta API key")
    except RateLimitError:
        raise HTTPException(status_code=429, detail="Meta rate limit reached, try again later")
    except APIConnectionError:
        raise HTTPException(status_code=503, detail="Could not connect to Meta")
    except APIStatusError:
        raise HTTPException(status_code=502, detail="Meta returned an error")


def parse_locate(text: str) -> tuple[bool, str]:
    start = text.find("{")
    end = text.rfind("}")
    try:
        data = json.loads(text[start:end + 1])
        found = data.get("found") is True
        guidance = str(data.get("guidance", "")).strip()
    except (ValueError, AttributeError):
        return False, text.strip()
    return found, guidance or text.strip()


@app.get("/")
def hello_world():
    return {"message":"Hello World"}

@app.get("/ai/ping", dependencies=GUARDED)
def ping():
    settings = get_settings()
    try:
        resp = get_meta_client().responses.create(model=settings.meta_model, input="Reply only: ok", reasoning={"effort":settings.meta_reasoning_effort}, max_output_tokens=300)
    except AuthenticationError:
        raise HTTPException(status_code=502, detail="Invalid Meta API key")
    except RateLimitError:
        raise HTTPException(status_code=429, detail="Meta rate limit reached, try again later")
    except APIConnectionError:
        raise HTTPException(status_code=503, detail="Could not connect to Meta")
    except APIStatusError:
        raise HTTPException(status_code=502, detail="Meta returned an error")

    return {"model": settings.meta_model, "reply":resp.output_text}

@app.post("/ai/describe", dependencies=GUARDED)
def describe(
    image: UploadFile,
    question: str = Form("Describe what is in front of me"),
    history: str = Form("[]"),
    allow_retake: bool = Form(True),
):
    try:
        turns = history_adapter.validate_json(history)
    except ValidationError:
        raise HTTPException(status_code=422, detail="History is not valid")
    messages = []
    for turn in turns[-MAX_HISTORY_TURNS:]:
        messages.append({"role": "user", "content": turn.question})
        messages.append({"role": "assistant", "content": turn.answer})

    data_url = image_data_url(image)

    can_retake = allow_retake and not turns
    instructions = MODEL_INSTRUCTIONS + (RETAKE_RULE if can_retake else "")

    settings = get_settings()
    resp = ask_meta(
        model=settings.meta_model,
        instructions=instructions,
        input=[
            *messages,
            {
                "role": "user",
                "content": [
                    {"type": "input_text", "text": question},
                    {"type": "input_image", "image_url": data_url},
                ],
            },
        ],
        reasoning={"effort": settings.meta_reasoning_effort},
        max_output_tokens=800,
    )

    answer = resp.output_text.strip()
    retake = can_retake and answer.startswith(RETAKE_MARKER)
    answer = answer.replace(RETAKE_MARKER, "").strip()
    return {"answer": answer, "retake": retake}


@app.post("/ai/locate", dependencies=GUARDED)
def locate(image: UploadFile, target: str = Form(min_length=1, max_length=200)):
    data_url = image_data_url(image)

    settings = get_settings()
    resp = ask_meta(
        model=settings.meta_model,
        instructions=LOCATE_INSTRUCTIONS,
        input=[{
            "role": "user",
            "content": [
                {"type": "input_text", "text": f"Target: {target}"},
                {"type": "input_image", "image_url": data_url},
            ],
        }],
        reasoning={"effort": settings.meta_reasoning_effort},
        max_output_tokens=300,
    )

    found, guidance = parse_locate(resp.output_text)
    return {"found": found, "guidance": guidance}

@app.post("/ai/transcribe", dependencies=GUARDED)
def transcribe(audio: UploadFile):
    if audio.content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(status_code=415, detail="Audio is not of a supported type, WAV is required")
    data = audio.file.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="The sent audio exceeds maximum size defined")

    settings = get_settings()
    request_config = {
        "mode": "PUSH_TO_TALK",
        "model": settings.meta_asr_model,
        "audioEncoding": "WAV",
    }
    try:
        resp = httpx.post(
            f"{settings.meta_base_url}/asr/transcribe",
            headers={"Authorization": f"Bearer {settings.meta_model_api_key.get_secret_value()}"},
            files={
                "request": (None, json.dumps(request_config), "application/json"),
                "audio": (audio.filename or "audio.wav", data, audio.content_type),
            },
            timeout=30.0,
        )
    except (httpx.TimeoutException, httpx.ConnectError):
        raise HTTPException(status_code=503, detail="Could not connect to Meta")

    if resp.status_code == 401:
        raise HTTPException(status_code=502, detail="Invalid Meta API key")
    if resp.status_code == 429:
        raise HTTPException(status_code=429, detail="Meta rate limit reached, try again later")
    if resp.status_code == 400:
        raise HTTPException(status_code=422, detail="Meta could not process the audio, expected mono 16-bit WAV at 16 or 24 kHz")
    if not resp.is_success:
        raise HTTPException(status_code=502, detail="Meta returned an error")

    return {"text": resp.json()["transcript"]}
