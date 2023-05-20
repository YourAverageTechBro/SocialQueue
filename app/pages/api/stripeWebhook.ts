import { createServerSupabaseClient } from "@supabase/auth-helpers-nextjs";
import type { NextApiResponse } from "next";
import { withAxiom, AxiomAPIRequest } from "next-axiom";
import Stripe from "stripe";

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const stripeWebhookSigningSecret = process.env.STRIPE_WEBHOOK_SIGNING_SECRET;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

async function handler(req: AxiomAPIRequest, res: NextApiResponse) {
  console.log("[stripe-webhook] attempting stripe webhook");
  const supabaseClient = createServerSupabaseClient({
    req,
    res,
  });
  try {
    const signature = req.headers["Stripe-Signature"];
    const body = JSON.parse(req.body);
    let receivedEvent;
    try {
      receivedEvent = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        stripeWebhookSigningSecret,
        undefined,
        cryptoProvider
      );
    } catch (err: any) {
      return new Response(err.message, { status: 400 });
    }
    console.log(`🔔 Event received: ${receivedEvent.id}`);

    // Secondly, we use this event to query the Stripe API in order to avoid
    // handling any forged event. If available, we use the idempotency key.
    const requestOptions =
      receivedEvent.request && receivedEvent.request.idempotency_key
        ? {
            idempotencyKey: receivedEvent.request.idempotency_key,
          }
        : {};

    let retrievedEvent;
    try {
      retrievedEvent = await stripe.events.retrieve(
        receivedEvent.id,
        requestOptions
      );
    } catch (err: any) {
      return new Response(err.message, { status: 400 });
    }

    let eventType = retrievedEvent.type;

    switch (eventType) {
      case "checkout.session.completed":
        // Payment is successful and the subscription is created.
        // You should provision the subscription and save the customer ID to your database.
        console.log(
          "[stripe-webhook][checkout.session.completed] retrievedEvent: ",
          retrievedEvent
        );
        const stripeSubscription = await stripe.subscriptions.retrieve(
          retrievedEvent.data.object
        );
        const stripeCheckoutSessionResponse = await supabaseClient
          .from("Users")
          .update({
            stripe_customer_id: retrievedEvent.data.object.customer,
            stripe_subscription_id: stripeSubscription.id,
            stripe_price_id: stripeSubscription.items.data[0].price.id,
            stripe_subscription_status: stripeSubscription.status,
          })
          .eq("stripe_checkout_session_id", retrievedEvent.data.object.id);
        if (stripeCheckoutSessionResponse.error)
          throw stripeCheckoutSessionResponse.error;
        console.log(
          "[stripe-webhook][checkout.session.completed] completed",
          stripeCheckoutSessionResponse
        );
      case "invoice.payment_succeeded":
        // Continue to provision the subscription as payments continue to be made.
        // Store the status in your database and check when a user accesses your service.
        // This approach helps you avoid hitting rate limits.
        console.log(
          "[stripe-webhook][invoice.payment_succeeded] retrievedEvent: ",
          retrievedEvent
        );
        const { error: paymentSucceededError } = await supabaseClient
          .from("Users")
          .update({
            stripe_subscription_status: "active",
          })
          .eq("stripe_customer_id", retrievedEvent.data.object.customer);
        if (paymentSucceededError) throw paymentSucceededError;
        console.log("[stripe-webhook][invoice.payment_succeeded] completed");
      case "invoice.payment_failed":
        // The payment failed or the customer does not have a valid payment method.
        // The subscription becomes past_due. Notify your customer and send them to the
        // customer portal to update their payment information.
        console.log(
          "[stripe-webhook][invoice.payment_failed] retrievedEvent: ",
          retrievedEvent
        );
        const { error: paymentFailedError } = await supabaseClient
          .from("Users")
          .update({
            stripe_subscription_status: "past_due",
          })
          .eq("stripe_customer_id", retrievedEvent.data.object.customer);
        if (paymentFailedError) throw paymentFailedError;
        console.log("[stripe-webhook][invoice.payment_failed] completed");
      case "customer.subscription.updated":
        console.log(
          "[stripe-webhook][invoice.subscription_updated] retrievedEvent: ",
          retrievedEvent
        );
        const { error: subscriptionUpdatedError } = await supabaseClient
          .from("Users")
          .update({
            stripe_price_id: retrievedEvent.data.object.items.data[0].price.id,
            stripe_subscription_status: receivedEvent.data.object.status,
          })
          .eq("stripe_customer_id", retrievedEvent.data.object.customer);
        if (subscriptionUpdatedError) throw subscriptionUpdatedError;
        console.log(
          "[stripe-webhook][invoice.subscription_deleted] completed"
        );

        // 💡 You could also read "cancel_at_period_end" if you'd like to email user and learn why they cancelled
        // or convince them to renew before their subscription is deleted at end of payment period.
        break;
      case "customer.subscription.deleted":
        console.log(
          "[stripe-webhook][invoice.subscription_deleted] retrievedEvent: ",
          retrievedEvent
        );
        const { error: subscriptionDeletedError } = await supabaseClient
          .from("Users")
          .update({
            stripe_subscription_status: "canceled",
          })
          .eq("stripe_customer_id", retrievedEvent.data.object.customer);
        if (subscriptionDeletedError) throw subscriptionDeletedError;
        console.log(
          "[stripe-webhook][invoice.subscription_deleted] completed"
        );
      default:
      // Unhandled event type
    }
    res.status(200).json({ status: "success" });
  } catch (error: any) {
    console.log("[stripe-webhook] Stripe webhook failed: ", error);
    res.status(500).json({ status: "failed" });
  }
  res.status(500).json({ status: "failed" });
}

export default withAxiom(handler);
