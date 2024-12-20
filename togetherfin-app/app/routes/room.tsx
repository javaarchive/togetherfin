import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Togetherfin Room" },
    { name: "description", content: "Togetherfin let's you easily host watch parties with your Jellyfin library." },
  ];
}

export default function Host() {
  return <Welcome />;
}
