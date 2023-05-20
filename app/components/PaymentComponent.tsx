import {
  CheckIcon,
  MinusIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/20/solid";
import { useUser } from "@supabase/auth-helpers-react";
import { log } from "next-axiom";
import { useState } from "react";

const plans = [
  {
    title: "Free",
    description: "Best for individual accounts",
    priceMonthly: 0,
    priceYearly: 0,
    mainFeatures: [
      { id: 1, value: "20 posts/month" },
      { id: 2, value: "Unlimited acounts" },
    ],
  },
  {
    title: "Pro",
    description: "For creators that want to care extra ",
    priceMonthly: 5,
    priceYearly: 50,
    mainFeatures: [
      { id: 1, value: "Unlimited posts" },
      { id: 2, value: "Unlimited acounts" },
      { id: 3, value: "No SocialQueue watermark on your video" },
      { id: 4, value: "Priority support (24 hour response)" },
    ],
  },
];
const features = [
  {
    title: "Number of accounts",
    tiers: [
      { title: "Free", value: "1 account" },
      { title: "Pro", featured: true, value: "Unlimited" },
      { title: "", featured: false, value: "" },
    ],
  },
  {
    title: "Number of posts",
    tiers: [
      { title: "Free", value: "20 posts/month" },
      { title: "Pro", featured: true, value: "Unlimited" },
    ],
  },
  {
    title: "SocialQueue watermark",
    tiers: [
      { title: "Free", value: "In the post and caption" },
      { title: "Pro", featured: true, value: "none" },
    ],
  },
  {
    title: "Priority support (within 24 hours)",
    tiers: [
      { title: "Free", value: false },
      { title: "Pro", featured: true, value: true },
    ],
  },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

enum Pricing {
  Monthly,
  Yearly,
}

const focusedPricingOption =
  "relative whitespace-nowrap rounded-md border-indigo-700 bg-white py-2 px-6 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50 focus:z-10 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-700";
const unfocusedPricingOption =
  "relative ml-0.5 whitespace-nowrap rounded-md border border-transparent py-2 px-6 text-sm font-medium text-indigo-200 hover:bg-indigo-800 focus:z-10 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-700";

const monthlyProPriceId =
  process.env.NEXT_PUBLIC_STRIPE_SOCIALQUEUE_PRO_MONTHLY_PRICE_ID;
const yearlyProPriceId =
  process.env.NEXT_PUBLIC_STRIPE_SOCIALQUEUE_PRO_YEARLY_PRICE_ID;

function PaymentComponent() {
  const [pricingType, setPricingType] = useState<Pricing>(Pricing.Monthly);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [quantity, setQuantity] = useState<number>(1);
  const user = useUser();

  const redirectToStripeCheckout = async () => {
    try {
      setIsLoading(true);
      const userId = user?.id;
      if (!userId) return;
      const resp = await fetch("/api/stripeCheckout", {
        method: "POST",
        body: JSON.stringify({
          priceId:
            pricingType === Pricing.Monthly
              ? monthlyProPriceId
              : yearlyProPriceId,
          quantity,
          userId: userId,
        }),
      });
      const json = await resp.json();
      window.location.href = json.redirectUrl;
    } catch (error: any) {
      log.error("[PaymentComponent][redirectToStripe]", error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateFinalPrice = () => {
    if (pricingType === Pricing.Monthly) {
      return `${quantity * 5} / month`;
    } else if (pricingType === Pricing.Yearly) {
      return `${quantity * 50} / year`;
    }
  };

  return (
    <div className="bg-gray-50">
      <header className="bg-indigo-600">
        <nav className="mx-auto max-w-7xl px-6 lg:px-8" aria-label="Top">
          <div className="flex w-full items-center justify-between border-b border-indigo-500 py-6 lg:border-none">
            <div className="flex items-center">
              <a href="#">
                <span className="sr-only">Your Company</span>
                <img
                  className="h-10 w-auto"
                  src="https://tailwindui.com/img/logos/mark.svg?color=white"
                  alt=""
                />
              </a>
            </div>
          </div>
        </nav>
      </header>

      <main>
        {/* Pricing section */}
        <div>
          <div className="relative bg-indigo-600">
            {/* Overlapping background */}
            <div
              aria-hidden="true"
              className="absolute bottom-0 hidden h-6 w-full bg-gray-50 lg:block"
            />

            <div className="relative mx-auto max-w-2xl px-6 pt-2 text-center sm:pt-2 lg:max-w-7xl lg:px-8">
              <h1 className="font-bold tracking-tight text-white">
                <span className="block lg:inline text-4xl sm:text-6xl">
                  Simple pricing
                </span>
                <p className="text-xl mt-8">
                  {" "}
                  How many pro accounts do you want to connect?{" "}
                </p>
                <div className="flex justify-center mt-8">
                  <div
                    className="border-gray-400 border-r shadow-md bg-white rounded-tl-lg rounded-bl-lg text-black h-auto flex flex-col justify-center px-4 hover:cursor-pointer hover:bg-slate-200"
                    onClick={(e) => {
                      e.preventDefault();
                      if (quantity > 1) {
                        setQuantity(quantity - 1);
                      }
                    }}
                  >
                    <MinusIcon className="h-6 w-6" />
                  </div>
                  <div className="shadow-md bg-white text-black text-2xl px-8 py-8">
                    {quantity}
                  </div>
                  <div
                    className="border-gray-400 border-l shadow-md bg-white text-black rounded-tr-lg rounded-br-lg h-auto flex flex-col justify-center px-4 hover:cursor-pointer hover:bg-slate-200"
                    onClick={(e) => {
                      e.preventDefault();
                      setQuantity(quantity + 1);
                    }}
                  >
                    <PlusIcon className="h-6 w-6" />
                  </div>
                </div>
                <p className="text-xl mt-8">Total: ${calculateFinalPrice()}</p>
                <button
                  className={classNames(
                    "bg-white text-black hover:bg-slate-200 mt-6 w-full inline-block py-2 px-8 border border-transparent rounded-md shadow-sm text-center text-sm font-medium sm:mt-0 sm:w-auto lg:mt-6"
                  )}
                  onClick={redirectToStripeCheckout}
                >
                  Upgrade now
                </button>
              </h1>
            </div>

            <h2 className="sr-only">Plans</h2>

            {/* Toggle */}
            <div className="relative mt-12 flex justify-center sm:mt-16">
              <div className="flex rounded-lg bg-indigo-700 p-0.5">
                <button
                  type="button"
                  className={
                    pricingType === Pricing.Monthly
                      ? focusedPricingOption
                      : unfocusedPricingOption
                  }
                  onClick={(e) => setPricingType(Pricing.Monthly)}
                >
                  Monthly billing
                </button>
                <button
                  type="button"
                  className={
                    pricingType === Pricing.Yearly
                      ? focusedPricingOption
                      : unfocusedPricingOption
                  }
                  onClick={(e) => setPricingType(Pricing.Yearly)}
                >
                  Yearly billing
                </button>
              </div>
            </div>

            {/* Cards */}
            <div className="relative mx-auto mt-8 max-w-2xl px-6 pb-8 sm:mt-12 lg:max-w-7xl lg:px-8 lg:pb-0">
              {/* <div className="relative space-y-6 lg:grid lg:grid-cols-3 lg:space-y-0"> */}
              <div className="flex justify-center gap-8">
                {plans.slice(1).map((plan) => (
                  <div
                    key={plan.title}
                    className={classNames(
                      "bg-white ring-2 ring-indigo-700 shadow-md pt-6 px-6 pb-3 rounded-lg lg:px-8 lg:pt-12"
                    )}
                  >
                    <div>
                      <h3
                        className={classNames(
                          "text-indigo-600 text-base font-semibold"
                        )}
                      >
                        {plan.title}
                      </h3>
                      <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-start">
                        <div className="mt-3 flex items-center">
                          <p
                            className={classNames(
                              "text-indigo-600 text-4xl font-bold tracking-tight"
                            )}
                          >
                            $
                            {pricingType === Pricing.Monthly
                              ? plan.priceMonthly
                              : plan.priceYearly}
                          </p>
                          <div className="ml-4">
                            {pricingType === Pricing.Monthly ? (
                              <p
                                className={classNames("text-gray-700 text-sm")}
                              >
                                / month per account
                              </p>
                            ) : (
                              <>
                                <p
                                  className={classNames(
                                    "text-gray-700 text-sm"
                                  )}
                                >
                                  / year per account
                                </p>
                                <p
                                  className={classNames(
                                    "text-gray-500 text-sm"
                                  )}
                                >
                                  2 months free compared to monthly billing
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <h4 className="sr-only">Features</h4>
                    <ul
                      role="list"
                      className={classNames(
                        "border-gray-200 divide-gray-200 mt-7 border-t divide-y lg:border-t-0"
                      )}
                    >
                      {plan.mainFeatures.map((mainFeature) => (
                        <li
                          key={mainFeature.id}
                          className="flex items-center py-3"
                        >
                          <CheckIcon
                            className={classNames(
                              "text-indigo-500 w-5 h-5 flex-shrink-0"
                            )}
                            aria-hidden="true"
                          />
                          <span
                            className={classNames(
                              "text-gray-600 ml-4 text-sm font-medium"
                            )}
                          >
                            {mainFeature.value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Feature comparison */}
          <section
            aria-labelledby="mobile-comparison-heading"
            className="lg:hidden"
          >
            <h2 id="mobile-comparison-heading" className="sr-only">
              Feature comparison
            </h2>

            <div className="mx-auto mt-16 max-w-2xl space-y-16 px-6">
              {plans.map((plan, planIndex) => (
                <div key={plan.title} className="border-t border-gray-200">
                  <div
                    className={classNames(
                      "border-indigo-600 -mt-px pt-6 border-t-2 sm:w-1/2"
                    )}
                  >
                    <h3
                      className={classNames(
                        "text-indigo-600 text-sm font-bold"
                      )}
                    >
                      {plan.title}
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                      {plan.description}
                    </p>
                  </div>
                  <h4 className="mt-10 text-sm font-bold text-gray-900">
                    Catered for business
                  </h4>

                  <div className="relative mt-6">
                    {/* Fake card background */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 hidden sm:block"
                    >
                      <div
                        className={classNames(
                          "shadow-md absolute right-0 w-1/2 h-full bg-white rounded-lg"
                        )}
                      />
                    </div>

                    <div
                      className={classNames(
                        "ring-2 ring-indigo-600 shadow-md relative py-3 px-4 bg-white rounded-lg sm:p-0 sm:bg-transparent sm:rounded-none sm:ring-0 sm:shadow-none"
                      )}
                    >
                      <dl className="divide-y divide-gray-200">
                        {features.map((feature) => (
                          <div
                            key={feature.title}
                            className="flex items-center justify-between py-3 sm:grid sm:grid-cols-2"
                          >
                            <dt className="pr-4 text-sm font-medium text-gray-600">
                              {feature.title}
                            </dt>
                            <dd className="flex items-center justify-end sm:justify-center sm:px-4">
                              {typeof feature.tiers[planIndex].value ===
                              "string" ? (
                                <span
                                  className={classNames(
                                    feature.tiers[planIndex].featured
                                      ? "text-indigo-600"
                                      : "text-gray-900",
                                    "text-sm font-medium"
                                  )}
                                >
                                  {feature.tiers[planIndex].value}
                                </span>
                              ) : (
                                <>
                                  {feature.tiers[planIndex].value === true ? (
                                    <CheckIcon
                                      className="mx-auto h-5 w-5 text-indigo-600"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <XMarkIcon
                                      className="mx-auto h-5 w-5 text-gray-400"
                                      aria-hidden="true"
                                    />
                                  )}

                                  <span className="sr-only">
                                    {feature.tiers[planIndex].value === true
                                      ? "Yes"
                                      : "No"}
                                  </span>
                                </>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    {/* Fake card border */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 hidden sm:block"
                    >
                      <div
                        className={classNames(
                          "ring-2 ring-indigo-600 absolute right-0 w-1/2 h-full rounded-lg"
                        )}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="comparison-heading"
            className="hidden lg:block"
          >
            <h2 id="comparison-heading" className="sr-only">
              Feature comparison
            </h2>

            <div className="mx-auto mt-24 max-w-7xl px-8">
              <div className="flex w-full items-stretch border-t border-gray-200">
                <div className="-mt-px flex w-1/4 items-end py-6 pr-4"></div>
                {plans.map((plan, index) => (
                  <div
                    key={plan.title}
                    aria-hidden="true"
                    className={classNames(
                      index === plans.length - 1 ? "" : "pr-4",
                      "-mt-px pl-4 w-1/4"
                    )}
                  >
                    <div
                      className={classNames(
                        "border-indigo-600 py-6 border-t-2"
                      )}
                    >
                      <p
                        className={classNames(
                          "text-indigo-600 text-sm font-bold"
                        )}
                      >
                        {plan.title}
                      </p>
                      <p className="mt-2 text-sm text-gray-500">
                        {plan.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="relative">
                {/* Fake card backgrounds */}
                <div
                  className="pointer-events-none absolute inset-0 flex items-stretch"
                  aria-hidden="true"
                >
                  <div className="w-1/4 pr-4" />
                  <div className="w-1/4 px-4">
                    <div className="h-full w-full rounded-lg bg-white shadow" />
                  </div>
                  <div className="w-1/4 px-4">
                    <div className="h-full w-full rounded-lg bg-white shadow-md" />
                  </div>
                </div>

                <table className="relative w-full">
                  <thead>
                    <tr className="text-left">
                      <th scope="col">
                        <span className="sr-only">Feature</span>
                      </th>
                      {plans.map((plan) => (
                        <th key={plan.title} scope="col">
                          <span className="sr-only">{plan.title} plan</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {features.map((feature) => (
                      <tr key={feature.title}>
                        <th
                          scope="row"
                          className="w-1/4 py-3 pr-4 text-left text-sm font-medium text-gray-600"
                        >
                          {feature.title}
                        </th>
                        {feature.tiers.map((tier, index) => (
                          <td
                            key={tier.title}
                            className={classNames(
                              index === feature.tiers.length - 1
                                ? "pl-4"
                                : "px-4",
                              "relative w-1/4 py-0 text-center"
                            )}
                          >
                            <span className="relative h-full w-full py-3">
                              {typeof tier.value === "string" ? (
                                <span
                                  className={classNames(
                                    tier.featured
                                      ? "text-indigo-600"
                                      : "text-gray-900",
                                    "text-sm font-medium"
                                  )}
                                >
                                  {tier.value}
                                </span>
                              ) : (
                                <>
                                  {tier.value === true ? (
                                    <CheckIcon
                                      className="mx-auto h-5 w-5 text-indigo-600"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <XMarkIcon
                                      className="mx-auto h-5 w-5 text-gray-400"
                                      aria-hidden="true"
                                    />
                                  )}

                                  <span className="sr-only">
                                    {tier.value === true ? "Yes" : "No"}
                                  </span>
                                </>
                              )}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer aria-labelledby="footer-heading">
          <h2 id="footer-heading" className="sr-only">
            Footer
          </h2>
          <div className="mx-auto max-w-7xl py-12 px-6 lg:py-16 lg:px-8">
            <div className="mt-12 border-t border-gray-200 pt-8">
              <p className="text-base text-gray-400 xl:text-center">
                &copy; 2021 Your Company, Inc. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default PaymentComponent;
