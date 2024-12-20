import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";
import { useMemo, useState } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Togetherfin Room" },
    { name: "description", content: "Togetherfin let's you easily host watch parties with your Jellyfin library." },
  ];
}

export default function Room() {

  let [isActive, setIsActive] = useState(false);
  let [isErroring, setIsErroring] = useState(false);
  let [roomValidation, setRoomValidation] = useState("");
  let shouldConfigure = useMemo(() => {
    return !isActive || isErroring;
  }, [isActive, isErroring]);

  return <>
    <div style={{
      display: shouldConfigure ? "block": "none"
    }}>
      {/* loader */}
      <div>
        Checking room status...
      </div>
    </div>
    <div>

    </div>
  </>;
}
