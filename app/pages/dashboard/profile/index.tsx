import { useEffect, useState } from "react";
import SocialAccountSetup from "../../../components/SocialAccountSetup";
import { useSupabaseClient, useUser } from "@supabase/auth-helpers-react";
import { User } from "../../../types/supabaseTypes";
import { useRouter } from "next/router";
import { Header } from "../../../components/LandingPage/Header";

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function Dashboard() {
  const [supabaseUser, setSupabaseUser] = useState<User | undefined>();
  const [loading, setLoading] = useState<boolean>(false);
  const supabase = useSupabaseClient();
  const user = useUser();
  const router = useRouter();
  const { code } = router.query;

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data, error } = await supabase
          .from("Users")
          .select(`*, SocialAccounts(*)`)
          .eq("id", userId);
        if (error) throw error;
        setSupabaseUser(data[0]);
      } catch (error) {
        console.log("error: ", error);
      }
    };

    const userId = user?.id;
    if (userId) {
      void getUser();
    }
  }, [supabase, user]);

  useEffect(() => {
    const initializeAccount = async () => {
      try {
        setLoading(true);
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
        router.push("/dashboard/profile");
      } catch (error) {
        console.log("error: ", error);
      } finally {
        setLoading(false);
      }
    };

    const email = user?.email;
    const userId = user?.id;
    if (code && email && userId) {
      initializeAccount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, user]);

  return (
    <div>
      <Header isLandingPage={false} />
      <SocialAccountSetup
        user={supabaseUser}
        setUser={setSupabaseUser}
        loading={loading}
      />
    </div>
  );
}
