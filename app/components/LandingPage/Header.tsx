import { Fragment } from "react";
import Link from "next/link";
import { Popover, Transition } from "@headlessui/react";
import clsx from "clsx";
import { StarIcon } from "@heroicons/react/24/outline";
import { useUser } from "@supabase/auth-helpers-react";
import { Container } from "./Container";
import logo from "./images/logos/social queue logo.png";
import Image from "next/image";

// @ts-ignore
function MobileLink({ href, children }) {
  return (
    <Popover.Button as={Link} href={href} className="inline-flex w-full p-2">
      {children}
    </Popover.Button>
  );
}

function MobileNavIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 overflow-visible stroke-slate-700"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path
        d="M0 1H14M0 7H14M0 13H14"
        className={clsx(
          "origin-center transition",
          open && "scale-90 opacity-0"
        )}
      />
      <path
        d="M2 2L12 12M12 2L2 12"
        className={clsx(
          "origin-center transition",
          !open && "scale-90 opacity-0"
        )}
      />
    </svg>
  );
}

function MobileNavigation() {
  const user = useUser();
  const isSignedIn = user !== null;

  return (
    <Popover>
      <Popover.Button
        className="relative z-10 flex h-8 w-8 items-center justify-center [&:not(:focus-visible)]:focus:outline-none"
        aria-label="Toggle Navigation"
      >
        {({ open }) => <MobileNavIcon open={open} />}
      </Popover.Button>
      <Transition.Root>
        <Transition.Child
          as={Fragment}
          enter="duration-150 ease-out"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="duration-150 ease-in"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <Popover.Overlay className="fixed inset-0 bg-slate-300/50" />
        </Transition.Child>
        <Transition.Child
          as={Fragment}
          enter="duration-150 ease-out"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="duration-100 ease-in"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
        >
          <Popover.Panel
            as="div"
            className="absolute inset-x-0 top-full mt-4 flex origin-top flex-col rounded-2xl bg-white p-4 text-lg tracking-tight text-slate-900 shadow-xl ring-1 ring-slate-900/5"
          >
            <MobileLink href="#features">Features</MobileLink>
            <MobileLink
              href={"https://github.com/YourAverageTechBro/SWEProjects"}
            >
              {" "}
              Star us on Github <StarIcon className={"h-6 w-6"} />
            </MobileLink>
            <hr className="m-2 border-slate-300/40" />
            {isSignedIn ? (
              <Link href="/dashboard/profile">
                <span>View your accounts</span>
              </Link>
            ) : (
              <Link href={"/auth"}>Sign up</Link>
            )}
          </Popover.Panel>
        </Transition.Child>
      </Transition.Root>
    </Popover>
  );
}

export function Header() {
  const user = useUser();
  const isSignedIn = user !== null;

  return (
    <header className="py-10">
      {/*@ts-ignore*/}
      <Container>
        <nav className="relative z-50 flex justify-between">
          <div className="flex items-center md:gap-x-12">
            <Link
              href="/"
              aria-label="Home"
              className="inline-flex items-center rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900"
            >
              <Image src={logo} alt="" width={150} height={32} unoptimized />
            </Link>
            <div className="hidden md:flex md:gap-x-6">
              <Link
                href="#features"
                className="inline-flex items-center rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              >
                Features
              </Link>
              <Link
                href={"https://github.com/YourAverageTechBro/SocialQueue"}
                className="inline-flex items-center rounded-lg px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              >
                {" "}
                Star us on Github <StarIcon className={"h-6 w-6"} />
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-x-5 md:gap-x-8">
            {isSignedIn ? (
              <Link href="/dashboard/profile">
                <span
                  className={
                    "hover:bg-slate-100 hover:text-slate-900 px-2 py-1 text-slate-700 rounded-lg"
                  }
                >
                  View your accounts
                </span>
              </Link>
            ) : (
              <Link href={"/auth"}>Sign up</Link>
            )}
            <div className="-mr-1 md:hidden">
              <MobileNavigation />
            </div>
          </div>
        </nav>
      </Container>
    </header>
  );
}
