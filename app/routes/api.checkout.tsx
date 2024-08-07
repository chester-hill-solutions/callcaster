import { json, ActionFunction, redirect } from "@remix-run/node";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const action: ActionFunction = async ({ request }) => {
  //const origin = new URL(request.url).origin;
  const plans = await stripe.prices.list({
    type: "recurring",
    active: true,
  });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: "price_XXXXXXXXXXXXXXXXXX",
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/success`,
      cancel_url: `${origin}/checkout`,
    });

    if (session.url) {
      return redirect(session.url);
    } else {
      throw new Error("Failed to create checkout session");
    }
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return json({ error: "An error occurred. Please try again." }, { status: 500 });
  }
};