import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { Auth, ThemeSupa } from "@supabase/auth-ui-react";
import { useRouter } from "next/router";
import { useEffect } from "react";

function AuthPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const userEmail = session?.user.email;
      const userId = session?.user.id;
      if (event === "SIGNED_IN" && userId && userEmail) {
        router.push("/dashboard/profile");
      }
    });
    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  return (
    <div className="flex h-full flex-col justify-center">
      <h1 className="flex w-full h-full justify-center">
        <div className="flex-col min-h-full items-center justify-center py-12 w-96">
          <p className="font-bold"> Welcome to SocialQueue </p>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            onlyThirdPartyProviders={process.env.NODE_ENV === "production"}
            providers={["google", "facebook"]}
            redirectTo={`${process.env.NEXT_PUBLIC_BASE_URL}/auth`}
          />
        </div>
      </h1>
    </div>
  );
}

export default AuthPage;
