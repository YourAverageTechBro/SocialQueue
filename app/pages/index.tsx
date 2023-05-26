import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";
import { Header } from "../components/LandingPage/Header";
import { Footer } from "../components/LandingPage/Footer";
import { Hero } from "../components/LandingPage/Hero";
import { PrimaryFeatures } from "../components/LandingPage/PrimaryFeature";

const navigation: any[] = [];
export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();
  const redirectToAuth = async () => {
    router.push("/auth");
  };
  return (
    <>
      <Head>
        <title>SocialQueue — A Notion Social Media Scheduler</title>
        <meta
          name="description"
          content={`SWE Projects is the home to high quality coding
          tutorials and projects that you'll actually be excited to show to 
          recruiters, friends, and family. Take your coding skills to the next
          level by building projects, deploying to the internet, and
          sharing with the world.`}
        />
      </Head>
      <Header isLandingPage={true} />
      <main>
        <Hero />
        <PrimaryFeatures />
      </main>
      <Footer />
    </>
  );
}
