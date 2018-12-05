import { format } from "date-fns";

export async function delay(seconds: number) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, seconds * 1000);
  });
}

export function DateSlug(date: Date): string {
  return format(date, "YY-MM-DD");
}
