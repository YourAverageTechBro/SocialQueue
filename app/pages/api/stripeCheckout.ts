import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";
import type { NextApiResponse } from "next";
import { withAxiom, AxiomAPIRequest } from "next-axiom";

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  console.log("[api/stripeCheckout] Starting stripeCheckout endpoint");
  const supabase = createServerSupabaseClient({
    req,
    res,
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session || !session.user) {
    res.status(500).json("unauthenticated request");
  }
  const body = JSON.parse(req.body);
  const { priceId, quantity, userId } = body;
  console.log(
    "[api/stripeCheckout] stripeCheckout initiated with the payload: ",
    {
      priceId,
      quantity,
      userId,
    }
  );
  if (!priceId || !quantity || !userId) {
    throw Error("Invalid payload");
  }
  if (req.method === "POST") {
    try {
      // Create Checkout Sessions from body params.
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            // Provide the exact Price ID (for example, pr_1234) of the product you want to sell
            price: priceId,
            quantity: quantity,
          },
        ],
        mode: "subscription",
        success_url: `${req.headers.origin}/dashboard/billing?success=true`,
        cancel_url: `${req.headers.origin}/dashboard/billing?canceled=true`,
        automatic_tax: { enabled: true },
      });
      const checkoutSessionId = session.id;
      const { data, error } = await supabase
        .from("Users")
        .update({ stripe_checkout_session_id: checkoutSessionId })
        .eq("id", userId);
      if (error) throw error;
      console.log("[api/stripeCheckout]: Successfully got checkout url", {
        ...data,
      });
      res.status(200).json({ redirectUrl: session.url });
    } catch (err: any) {
      console.error("[api/stripeCheckout]: Failed getting checkout URL", err);
      res.status(err.statusCode || 500).json(err.message);
    }
  } else {
    res.setHeader("Allow", "POST");
    res.status(405).end("Method Not Allowed");
  }
}

export default withAxiom(handler);
