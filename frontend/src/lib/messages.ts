const messages = {
  en: {
    tapToPhoto: "Tap anywhere to take a photo",
    tapAgain: "Tap anywhere to take another photo",
    thinking: "Looking at the photo, one moment",
    error: "Something went wrong. Tap anywhere to try again.",
    defaultQuestion: "Describe what is in front of me",
  },
  es: {
    tapToPhoto: "Toca en cualquier parte para tomar una foto",
    tapAgain: "Toca en cualquier parte para tomar otra foto",
    thinking: "Estoy mirando la foto, un momento",
    error: "Algo salió mal. Toca en cualquier parte para intentarlo de nuevo.",
    defaultQuestion: "Describe lo que tengo enfrente",
  },
};

export type Messages = (typeof messages)["en"];

export function getMessages(language: string): Messages {
  return language.toLowerCase().startsWith("es") ? messages.es : messages.en;
}
