const messages = {
  en: {
    tapToPhoto: "Tap anywhere to take a photo",
    intro: "Take a photo of what is around you, then ask your question out loud and I will answer by voice.",
    aimCamera: "Camera ready. Point it at what you want to know about. I will take the photo in a few seconds, or tap anywhere to take it now.",
    followUpPrompt: "You can ask another question, or say new photo.",
    sleeping: "I stopped listening to save battery. Use the buttons to continue.",
    photoError: "I could not take the photo. Say new photo to try again.",
    noCamera: "I could not open the camera. Tap anywhere to use your phone's camera app instead.",
    askAnother: "Ask another question about this photo",
    newPhoto: "Take a new photo",
    askQuestion: "Ask your question now",
    thinking: "Looking at the photo, one moment",
    noMicrophone: "I could not use the microphone, so I will describe the photo",
    error: "Something went wrong. Ask your question again, or say new photo.",
    busy: "I am receiving too many requests. Wait a few seconds, then ask again.",
    defaultQuestion: "Describe what is in front of me",
  },
  es: {
    tapToPhoto: "Toca en cualquier parte para tomar una foto",
    intro: "Toma una foto de lo que tienes alrededor, luego haz tu pregunta en voz alta y te responderé hablando.",
    aimCamera: "Cámara lista. Apunta hacia lo que quieres conocer. Tomaré la foto en unos segundos, o toca en cualquier parte para tomarla ya.",
    followUpPrompt: "Puedes hacer otra pregunta, o decir nueva foto.",
    sleeping: "Dejé de escuchar para ahorrar batería. Usa los botones para continuar.",
    photoError: "No pude tomar la foto. Di nueva foto para intentarlo de nuevo.",
    noCamera: "No pude abrir la cámara. Toca en cualquier parte para usar la aplicación de cámara de tu teléfono.",
    askAnother: "Hacer otra pregunta sobre esta foto",
    newPhoto: "Tomar una foto nueva",
    askQuestion: "Haz tu pregunta ahora",
    thinking: "Estoy mirando la foto, un momento",
    noMicrophone: "No pude usar el micrófono, así que describiré la foto",
    error: "Algo salió mal. Repite tu pregunta, o di nueva foto.",
    busy: "Estoy recibiendo demasiadas solicitudes. Espera unos segundos y vuelve a preguntar.",
    defaultQuestion: "Describe lo que tengo enfrente",
  },
};

export type Messages = (typeof messages)["en"];

export function getMessages(language: string): Messages {
  return language.toLowerCase().startsWith("es") ? messages.es : messages.en;
}
