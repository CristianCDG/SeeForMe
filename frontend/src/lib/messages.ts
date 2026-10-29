const messages = {
  en: {
    tapToPhoto: "Tap anywhere to take a photo",
    tapAgain: "Tap anywhere to take another photo",
    askQuestion: "Ask your question, then tap anywhere to finish",
    thinking: "Looking at the photo, one moment",
    noMicrophone: "I could not use the microphone, so I will describe the photo",
    error: "Something went wrong. Tap anywhere to try again.",
    defaultQuestion: "Describe what is in front of me",
  },
  es: {
    tapToPhoto: "Toca en cualquier parte para tomar una foto",
    tapAgain: "Toca en cualquier parte para tomar otra foto",
    askQuestion: "Haz tu pregunta y luego toca en cualquier parte para terminar",
    thinking: "Estoy mirando la foto, un momento",
    noMicrophone: "No pude usar el micrófono, así que describiré la foto",
    error: "Algo salió mal. Toca en cualquier parte para intentarlo de nuevo.",
    defaultQuestion: "Describe lo que tengo enfrente",
  },
};

export type Messages = (typeof messages)["en"];

export function getMessages(language: string): Messages {
  return language.toLowerCase().startsWith("es") ? messages.es : messages.en;
}
