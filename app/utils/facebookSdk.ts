import { log } from "next-axiom";

const facebookAppId = "5359260984203298";

export async function initFacebookSdk() {
  await createScriptEle();
  // wait for facebook sdk to initialize before starting the react app
  window.fbAsyncInit = () => {
    window.FB.init({
      appId: facebookAppId,
      cookie: true,
      xfbml: true,
      version: "v8.0",
    });

    // auto authenticate with the api if already logged in with facebook
    window.FB.getLoginStatus(() => {});
  };

  createScriptEle();
}

const createScriptEle = async () => {
  return new Promise((resolve) => {
    const scriptId = "facebook-jssdk";
    const element = document.getElementsByTagName("script")[0];
    const fjs = element as Element;

    // return if script already exists
    if (document.getElementById(scriptId)) {
      return;
    }

    const js: HTMLScriptElement = document.createElement("script");
    js.id = scriptId;
    js.src = "https://connect.facebook.net/en_US/sdk.js";
    js.onload = resolve;

    fjs.parentNode!.insertBefore(js, fjs);
  });
};

export const loginToFacebook = (
  callback: (res: fb.StatusResponse) => void,
  loginOptions: fb.LoginOptions
) => {
  window.FB.login(callback, loginOptions);
};

export const getInstagramAccountId = (
  setPotentialInstagramAccounts: (accounts: []) => void
) => {
  FB.api(
    "/me/accounts",
    "get",
    { fields: "picture{url},name,access_token,instagram_business_account" },
    (response: any) => {
      if (response.error) throw response.error;
      setPotentialInstagramAccounts(response.data);
    }
  );
};

export type InstagramAccount = {
  picture: {
    data: {
      url: string;
    };
  };
  id: string;
  name: string;
  access_token: string;
  instagram_business_account: {
    id: string;
  };
};
