from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from openai import AuthenticationError, RateLimitError, APIConnectionError, APIStatusError
from config import get_settings
from meta_client import get_meta_client
import base64
import json
import httpx

app = FastAPI()
ALLOWED_TYPES = ["image/png", "image/gif", "image/webp", "image/jpeg"]
ALLOWED_AUDIO_TYPES = ["audio/wav", "audio/x-wav", "audio/wave"]
MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MODEL_INSTRUCTIONS = "You help a blind or low-vision user understand their surroundings. Reply in the language of the question. Use short, clear sentences. Mention the most important or safety-relevant thing first. Do not guess; if something is unclear, say so."

@app.get("/")
def hello_world():
    return {"message":"Hello World"}

@app.get("/ai/ping")
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

@app.post("/ai/describe")
def describe(image: UploadFile, question: str = Form("Describe what is in front of me")):
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Image is not of a supported type")
    data = image.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="The sent image exceeds maximum size defined")
    encoded = base64.b64encode(data).decode()
    data_url = f"data:{image.content_type};base64,{encoded}"

    settings = get_settings()
    try:
        resp = get_meta_client().responses.create(
            model=settings.meta_model,
            instructions=MODEL_INSTRUCTIONS,
            input=[{
                "role": "user",
                "content": [
                    {"type": "input_text", "text": question},
                    {"type": "input_image", "image_url": data_url},
                ],
            }],
            reasoning={"effort": settings.meta_reasoning_effort},
            max_output_tokens=800,
        )
    except AuthenticationError:
        raise HTTPException(status_code=502, detail="Invalid Meta API key")
    except RateLimitError:
        raise HTTPException(status_code=429, detail="Meta rate limit reached, try again later")
    except APIConnectionError:
        raise HTTPException(status_code=503, detail="Could not connect to Meta")
    except APIStatusError:
        raise HTTPException(status_code=502, detail="Meta returned an error")

    return {"answer": resp.output_text}

@app.post("/ai/transcribe")
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
