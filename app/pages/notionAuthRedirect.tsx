import BackgroundGradient from "../components/BackgroundGradient";
import LoadingSpinner from "../components/LoadingSpinner";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useUser } from "@supabase/auth-helpers-react";

export default function NotionAuthRedirect() {
  const user = useUser();
  const router = useRouter();
  const { code } = router.query;
  const [initalizedAccount, setInitializedAccount] = useState<boolean>(false);

  useEffect(() => {
    const initializeAccount = async () => {
      try {
        const resp = await fetch("/api/notionAuth", {
          method: "POST",
          body: JSON.stringify({
            email,
            code,
            user_id: userId,
          }),
        });
        const json = await resp.json();
        if (json.error) throw json.error;
        setInitializedAccount(true);
      } catch (error) {
        console.log("error: ", error);
      } finally {
      }
    };

    const email = user?.email;
    const userId = user?.id;
    if (code && email && userId) {
      initializeAccount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, user]);

  useEffect(() => {
    if (initalizedAccount) {
      setTimeout(() => {
        router.push("/dashboard/profile");
      }, 3000);
    }
  }, [router, initalizedAccount]);

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
