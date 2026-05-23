export { loader } from "./confirm-payment.loader.server";

import { redirect, type LoaderFunctionArgs } from "react-router";

import Stripe from "stripe";

export default function ConfirmPayment() {
  return <div>Processing payment...</div>;
}
