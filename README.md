# SeeForMe

SeeForMe is a voice-first assistant for people who can't see well or at all. You open the page, tap the screen once, and from then on you mostly talk to it. It takes a photo with the phone camera, listens to your question, and answers out loud about what the camera sees.

I built it for the Meta AI Developer Hackathon 2026, using Muse Spark for the vision part and Muse Voice Transcribe for turning speech into text.

Live demo: https://see-for-me-orpin.vercel.app (the backend sleeps when idle, so the very first request can take close to a minute)

## Why voice only

Most "describe my surroundings" apps still expect you to find a camera button, frame a shot, and read or tap through results. That's hard if you can't see the screen. The whole screen here is one big button, the camera opens inside the page instead of launching the phone's camera app, and everything the app needs from you after the first tap is something you can say.

## What it does

- Tap anywhere and the camera opens. The app tells you it is ready and takes the photo by itself after a few seconds, or right away if you tap again.
- You ask your question out loud. It stops recording when you stop talking, so there is nothing to press.
- The answer is spoken back. Then it keeps listening, and you can ask a follow-up about the same photo. The last few turns are sent along with each question so "what color is it?" makes sense.
- A few voice commands work after an answer: "new photo", "repeat", and "find my keys" (or "busca mis llaves").
- If the photo is too blurry, too dark, or the thing you asked about is cut off, the model says how to move the phone and the app retakes the photo and reuses your question. It tries at most twice.
- Find mode takes a photo every couple of seconds and tells you where to turn the phone until it spots what you are looking for, up to 8 tries.
- English and Spanish. The language comes from the phone.

The buttons shown after an answer are still there as a fallback and work with TalkBack or VoiceOver.

## How it is built

```
phone browser  ->  Next.js (Vercel)  ->  FastAPI (Render)  ->  Meta API
```

The browser only talks to Next.js route handlers under `/api`. Those forward the request to the FastAPI backend and add the backend API key on the server, so no keys ever reach the browser. The backend checks that key, applies a global rate limit, and calls Meta.

- `muse-spark-1.3` in standard mode handles `/ai/describe` (questions about a photo, with history and the retake check) and `/ai/locate` (find mode).
- `muse-voice-transcribe-1.0` handles `/ai/transcribe`. The browser records, resamples to 16 kHz mono and encodes WAV itself, because that is the format the endpoint accepts.
- Spoken answers use the browser's built-in speech synthesis.

Folders: `backend/` is the FastAPI app, `frontend/` is the Next.js app.

## Running it locally

You need Python 3.12 and Node. From the repo root:

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env` from `backend/.env.example` and fill in `META_MODEL_API_KEY` and `APP_API_KEY` (any long random string). Then:

```
uvicorn main:app --app-dir backend --reload
```

For the frontend, copy `frontend/.env.example` to `frontend/.env.local`, set `BACKEND_URL=http://127.0.0.1:8000` and put the same value as `APP_API_KEY` in `BACKEND_API_KEY`.

```
cd frontend
npm install
npm run dev
```

Camera and microphone only work on `localhost` or over HTTPS, so testing on a phone needs a deployed or tunneled HTTPS URL.

## Things you should know

- The first tap is unavoidable. Browsers don't allow speech, camera or microphone until the user touches the page.
- I tested it on an iPhone with Safari. I have not tried it on Android or on other browsers.
- It can be wrong. The model is told to say when something is unclear and never to say a place or object is safe, but it is a photo, so don't use it to decide whether something is dangerous, and don't use it to walk around. Find mode is meant for objects within reach, like something on a table.
- Photos and audio are sent to Meta's API to get an answer. The backend doesn't save them.
- The rate limit lives in memory, which is fine for one instance but would need a shared store if the backend ran on several.
- The phone keeps its screen on while a session is running, and the camera stays open between photos so the browser doesn't ask for permission again each time.

## License

MIT, see the LICENSE file.

## Where I'd take it next

The part that matters most is the backend, and it doesn't know anything about phones. It takes an image and a question and returns text. The web app is just the first client for it, so the next steps are mostly about adding other clients.

**Smart glasses.** The obvious fit is glasses, like the Ray-Ban Meta ones that already run Meta's AI. Holding a phone up and tapping a screen is the clumsiest part of this app for a blind person. With glasses the camera is already pointing where you are looking, the microphone is already open and the answer comes through the speakers, so the tap goes away completely. I haven't built or tested anything on glasses yet. What I'd do is write a small client that sends the glasses' camera frame and the spoken question to the same `/ai/describe` and `/ai/locate` endpoints, and plays the answer back.

**IoT and fixed devices.** The same idea works on a small board with a camera, a microphone and a speaker, for example mounted by a door, on a kitchen shelf or on a cane. Someone could ask what the label on a package says, or whether the person at the door is holding something. For that I would replace the single shared API key with one key per device, and add per-device rate limits.

**Smaller things on the list:**
- Stream the answer so speech starts before the model has finished, which would cut the waiting time.
- Reading modes for medicine labels, money and menus, with answers in a fixed structure.
- A shared store for the rate limit so the backend can run on more than one instance.
- Testing with blind and low-vision users and measuring accuracy and response time on a real set of photos, which I haven't done yet.
