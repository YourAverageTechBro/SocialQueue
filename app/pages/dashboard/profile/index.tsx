import { useEffect, useState } from "react";
import SocialAccountSetup from "../../../components/SocialAccountSetup";
import { useSupabaseClient, useUser } from "@supabase/auth-helpers-react";
import { User } from "../../../types/supabaseTypes";
import { Header } from "../../../components/LandingPage/Header";

export default function Dashboard() {
  const [supabaseUser, setSupabaseUser] = useState<User | undefined>();
  const [loading, setLoading] = useState<boolean>(false);
  const supabase = useSupabaseClient();
  const user = useUser();

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
