import { forwardFormData } from "@/lib/backend";

export async function POST(request: Request) {
  return forwardFormData(request, "/ai/describe");
}
