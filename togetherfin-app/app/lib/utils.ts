import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function detectDiscordActivity(): boolean {
  if(typeof location != "undefined" && typeof location.hostname != "undefined"){
    if(location.hostname.endsWith(".discordsays.com")){
      return true;
    }
  }
  return false;
}

export function apiPath(path: string): string {
  return detectDiscordActivity() ? "/.proxy" + path : path;
}