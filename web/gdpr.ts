import { DeliveryMethod, WebhookHandler } from "@shopify/shopify-api";

// export default {
/**
 * Customers can request their data from a store owner. When this happens,
 * Shopify invokes this webhook.
 *
 * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#customers-data_request
 */
const CUSTOMERS_DATA_REQUEST: WebhookHandler = {
  deliveryMethod: DeliveryMethod.Http,
  callbackUrl: "/api/webhooks",
  callback: async (
    topic: unknown,
    shop: unknown,
    body: string,
    webhookId: unknown
  ) => {
    const payload = JSON.parse(body);
    // Payload has the following shape:
    // {
    //   "shop_id": 954889,
    //   "shop_domain": "{shop}.myshopify.com",
    //   "orders_requested": [
    //     299938,
    //     280263,
    //     220458
    //   ],
    //   "customer": {
    //     "id": 191167,
    //     "email": "john@example.com",
    //     "phone": "555-625-1199"
    //   },
    //   "data_request": {
    //     "id": 9999
    //   }
    // }
  },
};

/**
 * Store owners can request that data is deleted on behalf of a customer. When
 * this happens, Shopify invokes this webhook.
 *
 * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#customers-redact
 */
const CUSTOMERS_REDACT: WebhookHandler = {
  deliveryMethod: DeliveryMethod.Http,
  callbackUrl: "/api/webhooks",
  callback: async (
    topic: unknown,
    shop: unknown,
    body: string,
    webhookId: unknown
  ) => {
    const payload = JSON.parse(body);
    // Payload has the following shape:
    // {
    //   "shop_id": 954889,
    //   "shop_domain": "{shop}.myshopify.com",
    //   "customer": {
    //     "id": 191167,
    //     "email": "john@example.com",
    //     "phone": "555-625-1199"
    //   },
    //   "orders_to_redact": [
    //     299938,
    //     280263,
    //     220458
    //   ]
    // }
  },
};

/**
 * 48 hours after a store owner uninstalls your app, Shopify invokes this
 * webhook.
 *
 * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#shop-redact
 */
const SHOP_REDACT: WebhookHandler = {
  deliveryMethod: DeliveryMethod.Http,
  callbackUrl: "/api/webhooks",
  callback: async (
    topic: string,
    shop: string,
    body: string,
    webhookId: string
  ) => {
    const payload = JSON.parse(body);
    // Payload has the following shape:
    // {
    //   "shop_id": 954889,
    //   "shop_domain": "{shop}.myshopify.com"
    // }
  },
};

export { CUSTOMERS_DATA_REQUEST, CUSTOMERS_REDACT, SHOP_REDACT };
