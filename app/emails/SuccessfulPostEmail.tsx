import { Link } from "@react-email/link";
import { Section } from "@react-email/section";
import { Tailwind } from "@react-email/tailwind";

const SuccessfulInstagramPostEmail = () => {
  return (
    <Tailwind>
      <Section style={main}>
        <div className="mb-4 flex flex-col items-center justify-center text-xl">
          <div className="w-full">
            <img
              src={
                "https://fuslowuytpdyutmsflpa.supabase.co/storage/v1/object/public/assets/socialqueue-logo-large.png"
              }
              alt={"Social Queue Logo"}
            />
            <p className="font-semi text-4xl">
              Social Queue just successfully posted your Instagram Post 🎉
            </p>

            <ul>
              <li>
                Join
                <Link
                  className="underline hover:cursor-pointer"
                  href="https://discord.gg/urndgj94Gw"
                >
                  {" the Discord "}
                </Link>
                if you are running into any issues/need help.
              </li>

              <li>
                Leave project/feature requests on the
                <Link
                  className="underline hover:cursor-pointer"
                  href="https://youraveragetechbro.canny.io/social-queue"
                >
                  {" Social Queue Canny Board"}
                </Link>
              </li>
            </ul>

            <p>{"That's all for now 🙂"}</p>
          </div>
        </div>
      </Section>
    </Tailwind>
  );
};

// Styles for the email template
const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif",
};

export default SuccessfulInstagramPostEmail;
