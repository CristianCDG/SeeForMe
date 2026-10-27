from fastapi import FastAPI, HTTPException
from openai import AuthenticationError, RateLimitError, APIConnectionError, APIStatusError
from config import get_settings
from meta_client import get_meta_client

app = FastAPI()

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
