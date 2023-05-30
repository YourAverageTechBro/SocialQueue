import BackgroundGradient from "../components/BackgroundGradient";
import LoadingSpinner from "../components/LoadingSpinner";
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function NotionAuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    setTimeout(() => {
      router.push("/dashboard/profile");
    }, 4000);
  }, [router]);

  return (
    <>
      <BackgroundGradient />
      <div className={"flex flex-col items-center justify-center mt-24"}>
        <p className={"text-4xl font-bold"}>
          {" "}
          Congrats on authenticating with Notion!{" "}
        </p>
        <p className={"text-2xl font-semibold"}>
          {" "}
          Taking you back the home page in a few seconds...{" "}
        </p>
        <LoadingSpinner />
      </div>
    </>
  );
}
