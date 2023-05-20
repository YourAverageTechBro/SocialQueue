import { XMarkIcon } from "@heroicons/react/24/outline";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { useRouter } from "next/router";
import { Dispatch, SetStateAction, useState } from "react";
import AccountPickerModal from "./AccountPickerModal";
import { SocialAccounts, User } from "../types/supabaseTypes";
import {
  getInstagramAccountId,
  InstagramAccount,
  loginToFacebook,
} from "../utils/facebookSdk";
import { log } from "next-axiom";
import LoadingSpinner from "./LoadingSpinner";

type Props = {
  setUser: Dispatch<SetStateAction<User | undefined>>;
  user: User | undefined;
  loading: boolean;
};

function _wait(number: number) {
  return new Promise((resolve) => setTimeout(resolve, number));
}

export default function SocialAccountSetup({ loading, setUser, user }: Props) {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const [potentialInstagramAccounts, setPotentialInstagramAccounts] = useState<
    InstagramAccount[]
  >([]);
  const [openAccountPickerModal, setOpenAccountPickerModal] =
    useState<boolean>(false);
  const [appScopedUserId, setAppScopedUserId] = useState<string>("");
  const [isAddingAccounts, setIsAddingAccounts] = useState<boolean>(false);
  const [
    currentlyDeletingSocialAccountId,
    setCurrentlyDeletingSocialAccountId,
  ] = useState<number | null>(null);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const deleteSocialAccount = async (socialAccountId: number) => {
    if (!user) return;
    try {
      setCurrentlyDeletingSocialAccountId(socialAccountId);
      const { error: deletePostError } = await supabase
        .from("InstagramPosts")
        .delete()
        .eq("instagram_account_id", socialAccountId);
      if (deletePostError) throw deletePostError;
      const { error: deleteAccountError } = await supabase
        .from("SocialAccounts")
        .delete()
        .eq("id", socialAccountId);
      if (deletePostError) throw deleteAccountError;
      const updatedSocialAccounts = user;
      updatedSocialAccounts.SocialAccounts = user.SocialAccounts.filter(
        (socialAccount: SocialAccounts) => socialAccount.id !== socialAccountId
      );
      setUser(updatedSocialAccounts);
    } catch (error) {
      console.log("error: ", error);
    } finally {
      setCurrentlyDeletingSocialAccountId(null);
    }
  };

  const setInstagramAccount = async (
    instagramBusinessAccountId: string,
    accessToken: string,
    username: string,
    appScopedUserId: string,
    numberOfAccounts: number,
    iteration: number
  ) => {
    try {
      setIsAddingAccounts(true);
      const userId = user?.id;
      if (!userId) throw Error("no userId found");
      const instagramAccountExists = await checkIfInstagramAccountExists(
        userId,
        instagramBusinessAccountId
      );
      if (instagramAccountExists) {
        alert("instagram account already connected");
      } else {
        await generatePermanentPageAccessToken(
          accessToken,
          appScopedUserId,
          instagramBusinessAccountId,
          userId
        );

        await createSampleSocialPostForAccount(username);

        const { data, error } = await supabase
          .from("SocialAccounts")
          .select()
          .eq("social_id", instagramBusinessAccountId)
          .eq("social_platform", "instagram");
        if (error) throw error;
        if (data && data.length > 0) {
          const newlyAddedSocialAccount = data[0];
          const updatedUser = user;
          updatedUser.SocialAccounts = [
            newlyAddedSocialAccount,
            ...user.SocialAccounts,
          ];
          setUser(updatedUser);
        }
      }
    } catch (error) {
      console.log("error: ", error);
    } finally {
      if (iteration === numberOfAccounts - 1) {
        setIsAddingAccounts(false);
      }
    }
  };

  const generatePermanentPageAccessToken = async (
    accessToken: string,
    appScopedUserId: string,
    instagramBusinessAccountId: string,
    userId: string
  ) => {
    try {
      await fetch("/api/facebookAccessToken", {
        method: "POST",
        body: JSON.stringify({
          shortLivedAccessToken: accessToken,
          appScopedUserId,
          instagramBusinessAccountId,
          userId,
        }),
      });
    } catch (error) {
      console.log("error: ", error);
    }
  };

  const createSampleSocialPostForAccount = async (username: string) => {
    try {
      await fetch("/api/sampleNotionSocialPost", {
        method: "POST",
        body: JSON.stringify({
          notionAccessToken: user?.notion_access_token,
          notionDatabaseId: user?.notion_duplicated_template_id,
          username,
          platform: "instagram",
          color: "gray",
        }),
      });
    } catch (error) {
      console.log("error: ", error);
    }
  };
  const checkIfInstagramAccountExists = async (
    userId: string,
    accountId: string
  ) => {
    let instgramAccountExists = false;
    try {
      const { data, error } = await supabase
        .from("SocialAccounts")
        .select("*")
        .match({
          user_id: userId,
          social_id: accountId,
          social_platform: "instagram",
        });
      if (error) throw error;
      if (data.length > 0) {
        instgramAccountExists = true;
      }
    } catch (error) {
      console.log("error: ", error);
    } finally {
      return instgramAccountExists;
    }
  };

  const setFacebookAccountsCallback = (accounts: InstagramAccount[]) => {
    setPotentialInstagramAccounts(accounts);
    setOpenAccountPickerModal(true);
  };

  const facebookLoginCallback = (res: fb.StatusResponse) => {
    if (res.status === "connected") {
      const appScopedUserId = res.authResponse.userID;
      setAppScopedUserId(appScopedUserId);
      getInstagramAccountId(setFacebookAccountsCallback);
    }
  };

  const saveUserAccount = async (instagramAccounts: InstagramAccount[]) => {
    await Promise.all(
      instagramAccounts.map(
        async (instagramAccount: InstagramAccount, index: number) => {
          await _wait(1000);
          const facebookPageId = instagramAccount.id;
          const accessToken = instagramAccount.access_token;
          FB.api(
            `/${facebookPageId}`,
            "get",
            { fields: "instagram_business_account,username" },
            (response: any) => {
              if (response.error) {
                log.error(
                  `Error getting instagram info ${JSON.stringify(
                    response.error
                  )}`
                );
              }
              const instagramBusinessAccountId =
                response.instagram_business_account.id;
              const username = instagramAccount.name;
              setInstagramAccount(
                instagramBusinessAccountId,
                accessToken,
                username,
                appScopedUserId,
                instagramAccounts.length,
                index
              );
            }
          );
        }
      )
    );
  };

  return (
    <div className="flex p-4 h-full">
      <style global jsx>{`
        html,
        body,
        body > div:first-child,
        div#__next,
        div#__next > div {
          height: 100%;
        }
      `}</style>
      <div className="absolute inset-x-0 top-[-10rem] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[-20rem]">
        <svg
          className="relative left-[calc(50%-11rem)] -z-10 h-[21.1875rem] max-w-none -translate-x-1/2 rotate-[30deg] sm:left-[calc(50%-30rem)] sm:h-[42.375rem]"
          viewBox="0 0 1155 678"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="url(#45de2b6b-92d5-4d68-a6a0-9b9b2abad533)"
            fillOpacity=".3"
            d="M317.219 518.975L203.852 678 0 438.341l317.219 80.634 204.172-286.402c1.307 132.337 45.083 346.658 209.733 145.248C936.936 126.058 882.053-94.234 1031.02 41.331c119.18 108.451 130.68 295.337 121.53 375.223L855 299l21.173 362.054-558.954-142.079z"
          />
          <defs>
            <linearGradient
              id="45de2b6b-92d5-4d68-a6a0-9b9b2abad533"
              x1="1155.49"
              x2="-78.208"
              y1=".177"
              y2="474.645"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#9089FC" />
              <stop offset={1} stopColor="#FF80B5" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      {loading && (
        <LoadingSpinner styleOverride="flex justify-center items-center w-full" />
      )}
      {!loading && !user?.notion_duplicated_template_id && (
        <div className="flex flex-col">
          <h3 className="font-bold text-2xl">
            {" "}
            Add SocialQueue to your Notion
          </h3>
          <h3 className="text-md">
            {" "}
            Make sure to add the developer provided template into your Notion{" "}
          </h3>
          <button
            type="button"
            className="inline-flex justify-center items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 mt-4 w-48"
            onClick={() => {
              window.location.href =
                process.env.NEXT_PUBLIC_NOTION_REDIRECT_URL ?? "";
            }}
          >
            Add To Your Notion
          </button>
        </div>
      )}
      {!loading && user?.notion_duplicated_template_id && (
        <div className="flex flex-col justify-center w-full">
          <div className="bg-green-200 rounded-lg px-8 py-16">
            <p className="font-bold">
              {" "}
              SocialQueue is connected to {user?.notion_workspace_name}{" "}
            </p>
          </div>

          <p className="font-bold mt-4 mb-4">Connected Instagram Accounts</p>
          <button
            type="button"
            className="mb-8 w-48 rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            onClick={() => {
              loginToFacebook(facebookLoginCallback, {
                scope:
                  "instagram_basic,instagram_content_publish,pages_read_engagement",
              });
            }}
          >
            Connect Your Instagram Accounts
          </button>
          <div className="mb-2 border-b-2 pb-2 w-1/2 flex flex-col gap-4">
            {isAddingAccounts && (
              <LoadingSpinner styleOverride="flex justify-start ml-20" />
            )}
            {!isAddingAccounts &&
              user?.SocialAccounts.filter(
                (socialAccount: SocialAccounts) =>
                  socialAccount.social_platform === "instagram"
              ).map((socialAccount: SocialAccounts, index: number) => (
                <div
                  key={index}
                  className="relative flex items-center space-x-3 rounded-lg border border-gray-300 bg-white px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:border-gray-400"
                >
                  <div className="flex justify-between w-full">
                    <p className="text-md font-medium text-gray-900">
                      {socialAccount.username}
                    </p>
                    {currentlyDeletingSocialAccountId === socialAccount.id ? (
                      <LoadingSpinner />
                    ) : (
                      <XMarkIcon
                        className="h-6 w-6 text-red-500 hover:cursor-pointer"
                        onClick={() => {
                          deleteSocialAccount(socialAccount.id);
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
          </div>
          <button
            type="button"
            className="mt-4 inline-flex justify-center items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-red-500 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 w-48"
            onClick={signOut}
          >
            Logout
          </button>
        </div>
      )}
      <AccountPickerModal
        instagramAccounts={potentialInstagramAccounts}
        open={openAccountPickerModal}
        setOpen={setOpenAccountPickerModal}
        saveUserAccounts={saveUserAccount}
        alreadySelectedAccountIds={
          user?.SocialAccounts.map(
            (socialAccount: SocialAccounts) => socialAccount.social_id
          ) ?? []
        }
      />
    </div>
  );
}
