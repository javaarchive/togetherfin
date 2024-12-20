import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Host a room." },
    { name: "description", content: "Host a new Togetherfin room." },
  ];
}

export default function Host() {
  return <Welcome />;
}
