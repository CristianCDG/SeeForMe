import time
from collections import deque
from functools import lru_cache
from threading import Lock
from fastapi import HTTPException
from config import get_settings


class SlidingWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.timestamps: deque[float] = deque()
        self.lock = Lock()

    def check(self) -> int | None:
        now = time.monotonic()
        with self.lock:
            while self.timestamps and now - self.timestamps[0] >= self.window_seconds:
                self.timestamps.popleft()
            if len(self.timestamps) >= self.max_requests:
                return int(self.window_seconds - (now - self.timestamps[0])) + 1
            self.timestamps.append(now)
            return None


@lru_cache
def get_limiter() -> SlidingWindowLimiter:
    settings = get_settings()
    return SlidingWindowLimiter(settings.rate_limit_requests, settings.rate_limit_window_seconds)


def enforce_rate_limit():
    retry_after = get_limiter().check()
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many requests, try again later",
            headers={"Retry-After": str(retry_after)},
        )
