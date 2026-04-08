import { BackendHealthDevOnly } from "@/components/BackendHealthDevOnly";
import { ControlRoomHomeClient } from "@/components/ControlRoomHomeClient";

export default function Home() {
  return (
    <>
      <ControlRoomHomeClient />
      <BackendHealthDevOnly />
    </>
  );
}
