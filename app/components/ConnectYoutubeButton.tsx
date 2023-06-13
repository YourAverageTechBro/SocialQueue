import { useGoogleLogin } from "@react-oauth/google";
import toast from "react-hot-toast";
import { log } from "next-axiom";

type Props = {
  userId: string;
};
export default function ConnectYoutubeButton({ userId }: Props) {
  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      const resp = await fetch(
        `/api/youtubeUploader?accessToken=${tokenResponse.code}&userId=${userId}`
      );
      const json = await resp.json();
      if (json.error) {
        log.error(`Add youtube account failed`);
        toast.error(
          "Sorry, something went wrong saving your account. We're actively looking into fixing it."
        );
      }
    },
    flow: "auth-code",
    scope:
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtubepartner https://www.googleapis.com/auth/youtube.force-ssl",
  });
  return (
    <button
      className="mb-8 w-48 rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      onClick={() => login()}
    >
      {" "}
      connect with google{" "}
    </button>
  );
}
