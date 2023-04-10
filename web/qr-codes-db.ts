/*
  This file interacts with the app's database and is used by the app's REST APIs.
*/

import sqlite3, { Database } from "sqlite3";
import path from "path";
import shopify from "./shopify";

const DEFAULT_DB_FILE = path.join(process.cwd(), "qr_codes_db.sqlite");
const DEFAULT_PURCHASE_QUANTITY = 1;

export type QRCode = {
  id: string;
  shopDomain: string;
  title: string;
  productId: string;
  variantId: string;
  handle: () => void;
  discountId: string;
  discountCode: string;
  destination: string;
  scans: number;
  imageUrl: string;
};

const qrCodesTableName = "qr_codes";

export class QRCodesDatastore {
  private db!: Database;
  private static instance: QRCodesDatastore;

  public create = async ({
    shopDomain,
    title,
    productId,
    variantId,
    handle,
    discountId,
    discountCode,
    destination,
  }: QRCode) => {
    const query = `
      INSERT INTO ${qrCodesTableName}
      (shopDomain, title, productId, variantId, handle, discountId, discountCode, destination, scans)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      RETURNING id;
    `;

    const rawResults = await this.__query<QRCode>(query, [
      shopDomain,
      title,
      productId,
      variantId,
      handle,
      discountId,
      discountCode,
      destination,
    ]);

    return rawResults[0].id;
  };

  public update = async (
    id: string,
    {
      title,
      productId,
      variantId,
      handle,
      discountId,
      discountCode,
      destination,
    }: QRCode
  ) => {
    const query = `
      UPDATE ${qrCodesTableName}
      SET
        title = ?,
        productId = ?,
        variantId = ?,
        handle = ?,
        discountId = ?,
        discountCode = ?,
        destination = ?
      WHERE
        id = ?;
    `;

    await this.__query(query, [
      title,
      productId,
      variantId,
      handle,
      discountId,
      discountCode,
      destination,
      id,
    ]);
    return true;
  };

  public list = async (shopDomain: string) => {
    const query = `
      SELECT * FROM ${qrCodesTableName}
      WHERE shopDomain = ?;
    `;

    const results = await this.__query<QRCode>(query, [shopDomain]);

    return results.map((qrcode) => this.__addImageUrl(qrcode));
  };

  public read = async (id: string) => {
    const query = `
      SELECT * FROM ${qrCodesTableName}
      WHERE id = ?;
    `;
    const rows = await this.__query<QRCode>(query, [id]);
    if (!Array.isArray(rows) || rows?.length !== 1) return undefined;

    return this.__addImageUrl(rows[0]);
  };

  public delete = async (id: string) => {
    const query = `
      DELETE FROM ${qrCodesTableName}
      WHERE id = ?;
    `;
    await this.__query(query, [id]);
    return true;
  };

  /* The destination URL for a QR code is generated at query time */
  public generateQrcodeDestinationUrl = (qrcode: { id: string }) => {
    return `${shopify.api.config.hostScheme}://${shopify.api.config.hostName}/qrcodes/${qrcode.id}/scan`;
  };

  /* The behavior when a QR code is scanned */
  public handleCodeScan = async (qrcode: QRCode) => {
    /* Log the scan in the database */
    await this.__increaseScanCount(qrcode);

    const url = new URL(qrcode.shopDomain);
    switch (qrcode.destination) {
      /* The QR code redirects to the product view */
      case "product":
        return this.__goToProductView(url, qrcode);

      /* The QR code redirects to checkout */
      case "checkout":
        return this.__goToProductCheckout(url, qrcode);

      default:
        throw `Unrecognized destination "${qrcode.destination}"`;
    }
  };

  /* Private */

  /*
    Used to check whether to create the database.
    Also used to make sure the database and table are set up before the server starts.
  */

  private __hasQrCodesTable = async () => {
    const query = `
      SELECT name FROM sqlite_schema
      WHERE
        type = 'table' AND
        name = ?;
    `;
    const rows = await this.__query(query, [qrCodesTableName]);
    return rows.length === 1;
  };

  /* Initializes the connection with the app's sqlite3 database */
  public static init = async () => {
    /* Initializes the connection to the database */
    if (!QRCodesDatastore.instance) {
      QRCodesDatastore.instance = new QRCodesDatastore();
      QRCodesDatastore.instance.db = new sqlite3.Database(DEFAULT_DB_FILE);
    }

    const hasQrCodesTable = await QRCodesDatastore.instance.__hasQrCodesTable();

    if (!hasQrCodesTable) {
      const query = `
        CREATE TABLE ${qrCodesTableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          shopDomain VARCHAR(511) NOT NULL,
          title VARCHAR(511) NOT NULL,
          productId VARCHAR(255) NOT NULL,
          variantId VARCHAR(255) NOT NULL,
          handle VARCHAR(255) NOT NULL,
          discountId VARCHAR(255) NOT NULL,
          discountCode VARCHAR(255) NOT NULL,
          destination VARCHAR(255) NOT NULL,
          scans INTEGER,
          createdAt DATETIME NOT NULL DEFAULT (datetime(CURRENT_TIMESTAMP, 'localtime'))
        )
      `;

      await QRCodesDatastore.instance.__query(query);
    }
  };

  /* Perform a query on the database. Used by the various CRUD methods. */
  private __query = <T>(sql: string, params: unknown[] = []) => {
    return new Promise<T[]>((resolve, reject) => {
      QRCodesDatastore.instance.db.all<T>(sql, params, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  };

  private __addImageUrl = (qrcode: QRCode) => {
    try {
      qrcode.imageUrl = this.__generateQrcodeImageUrl(qrcode);
    } catch (err) {
      console.error(err);
    }

    return qrcode;
  };

  private __generateQrcodeImageUrl = (qrcode: QRCode) => {
    return `${shopify.api.config.hostScheme}://${shopify.api.config.hostName}/qrcodes/${qrcode.id}/image`;
  };

  private __increaseScanCount = async (qrcode: QRCode) => {
    const query = `
      UPDATE ${qrCodesTableName}
      SET scans = scans + 1
      WHERE id = ?
    `;
    await this.__query(query, [qrcode.id]);
  };

  private __goToProductView = (url: URL, qrcode: QRCode) => {
    return productViewURL({
      discountCode: qrcode.discountCode,
      host: url.toString(),
      productHandle: qrcode.handle,
    });
  };

  private __goToProductCheckout = (url: URL, qrcode: QRCode) => {
    return productCheckoutURL({
      discountCode: qrcode.discountCode,
      host: url.toString(),
      variantId: qrcode.variantId,
      quantity: DEFAULT_PURCHASE_QUANTITY,
    });
  };
}

// export const QRCodesDB = {
//   qrCodesTableName: "qr_codes",
//   db: Database,
//   ready: () => Promise<unknown>,
//
//   create: async function({
//     shopDomain,
//     title,
//     productId,
//     variantId,
//     handle,
//     discountId,
//     discountCode,
//     destination,
//   }: Create) {
//     await this.ready;
//
//     const query = `
//       INSERT INTO ${this.qrCodesTableName}
//       (shopDomain, title, productId, variantId, handle, discountId, discountCode, destination, scans)
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
//       RETURNING id;
//     `;
//
//     const rawResults = await this.__query(query, [
//       shopDomain,
//       title,
//       productId,
//       variantId,
//       handle,
//       discountId,
//       discountCode,
//       destination,
//     ]);
//
//     return rawResults[0].id;
//   },
//
//   update: async function(
//     id,
//     {
//       title,
//       productId,
//       variantId,
//       handle,
//       discountId,
//       discountCode,
//       destination,
//     }
//   ) {
//     await this.ready;
//
//     const query = `
//       UPDATE ${this.qrCodesTableName}
//       SET
//         title = ?,
//         productId = ?,
//         variantId = ?,
//         handle = ?,
//         discountId = ?,
//         discountCode = ?,
//         destination = ?
//       WHERE
//         id = ?;
//     `;
//
//     await this.__query(query, [
//       title,
//       productId,
//       variantId,
//       handle,
//       discountId,
//       discountCode,
//       destination,
//       id,
//     ]);
//     return true;
//   },
//
//   list: async function(shopDomain) {
//     await this.ready;
//     const query = `
//       SELECT * FROM ${this.qrCodesTableName}
//       WHERE shopDomain = ?;
//     `;
//
//     const results = await this.__query(query, [shopDomain]);
//
//     return results.map((qrcode) => this.__addImageUrl(qrcode));
//   },
//
//   read: async function(id) {
//     await this.ready;
//     const query = `
//       SELECT * FROM ${this.qrCodesTableName}
//       WHERE id = ?;
//     `;
//     const rows = await this.__query(query, [id]);
//     if (!Array.isArray(rows) || rows?.length !== 1) return undefined;
//
//     return this.__addImageUrl(rows[0]);
//   },
//
//   delete: async function(id) {
//     await this.ready;
//     const query = `
//       DELETE FROM ${this.qrCodesTableName}
//       WHERE id = ?;
//     `;
//     await this.__query(query, [id]);
//     return true;
//   },
//
//   /* The destination URL for a QR code is generated at query time */
//   generateQrcodeDestinationUrl: function(qrcode) {
//     return `${shopify.api.config.hostScheme}://${shopify.api.config.hostName}/qrcodes/${qrcode.id}/scan`;
//   },
//
//   /* The behavior when a QR code is scanned */
//   handleCodeScan: async function(qrcode) {
//     /* Log the scan in the database */
//     await this.__increaseScanCount(qrcode);
//
//     const url = new URL(qrcode.shopDomain);
//     switch (qrcode.destination) {
//       /* The QR code redirects to the product view */
//       case "product":
//         return this.__goToProductView(url, qrcode);
//
//       /* The QR code redirects to checkout */
//       case "checkout":
//         return this.__goToProductCheckout(url, qrcode);
//
//       default:
//         throw `Unrecognized destination "${qrcode.destination}"`;
//     }
//   },
//
//   /* Private */
//
//   /*
//     Used to check whether to create the database.
//     Also used to make sure the database and table are set up before the server starts.
//   */
//
//   __hasQrCodesTable: async function() {
//     const query = `
//       SELECT name FROM sqlite_schema
//       WHERE
//         type = 'table' AND
//         name = ?;
//     `;
//     const rows = await this.__query(query, [this.qrCodesTableName]);
//     return rows.length === 1;
//   },
//
//   /* Initializes the connection with the app's sqlite3 database */
//   init: async function() {
//     /* Initializes the connection to the database */
//     this.db = this.db ?? new sqlite3.Database(DEFAULT_DB_FILE);
//
//     const hasQrCodesTable = await this.__hasQrCodesTable();
//
//     if (hasQrCodesTable) {
//       this.ready = Promise.resolve();
//
//       /* Create the QR code table if it hasn't been created */
//     } else {
//       const query = `
//         CREATE TABLE ${this.qrCodesTableName} (
//           id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
//           shopDomain VARCHAR(511) NOT NULL,
//           title VARCHAR(511) NOT NULL,
//           productId VARCHAR(255) NOT NULL,
//           variantId VARCHAR(255) NOT NULL,
//           handle VARCHAR(255) NOT NULL,
//           discountId VARCHAR(255) NOT NULL,
//           discountCode VARCHAR(255) NOT NULL,
//           destination VARCHAR(255) NOT NULL,
//           scans INTEGER,
//           createdAt DATETIME NOT NULL DEFAULT (datetime(CURRENT_TIMESTAMP, 'localtime'))
//         )
//       `;
//
//       /* Tell the various CRUD methods that they can execute */
//       this.ready = this.__query(query);
//     }
//   },
//
//   /* Perform a query on the database. Used by the various CRUD methods. */
//   __query: function <T>(sql: string, params: unknown[] = []) {
//     return new Promise<T>((resolve, reject) => {
//       this.db.all<T>(sql, params, (err, result) => {
//         if (err) {
//           reject(err);
//           return;
//         }
//         resolve(result);
//       });
//     });
//   },
//
//   __addImageUrl: function(qrcode) {
//     try {
//       qrcode.imageUrl = this.__generateQrcodeImageUrl(qrcode);
//     } catch (err) {
//       console.error(err);
//     }
//
//     return qrcode;
//   },
//
//   __generateQrcodeImageUrl: function(qrcode) {
//     return `${shopify.api.config.hostScheme}://${shopify.api.config.hostName}/qrcodes/${qrcode.id}/image`;
//   },
//
//   __increaseScanCount: async function(qrcode) {
//     const query = `
//       UPDATE ${this.qrCodesTableName}
//       SET scans = scans + 1
//       WHERE id = ?
//     `;
//     await this.__query(query, [qrcode.id]);
//   },
//
//   __goToProductView: function(url, qrcode) {
//     return productViewURL({
//       discountCode: qrcode.discountCode,
//       host: url.toString(),
//       productHandle: qrcode.handle,
//     });
//   },
//
//   __goToProductCheckout: function(url, qrcode) {
//     return productCheckoutURL({
//       discountCode: qrcode.discountCode,
//       host: url.toString(),
//       variantId: qrcode.variantId,
//       quantity: DEFAULT_PURCHASE_QUANTITY,
//     });
//   },
// };

/* Generate the URL to a product page */
function productViewURL({ host, productHandle, discountCode }: any) {
  const url = new URL(host);
  const productPath = `/products/${productHandle}`;

  /* If this QR Code has a discount code, then add it to the URL */
  if (discountCode) {
    url.pathname = `/discount/${discountCode}`;
    url.searchParams.append("redirect", productPath);
  } else {
    url.pathname = productPath;
  }

  return url.toString();
}

/* Generate the URL to checkout with the product in the cart */
function productCheckoutURL({
  host,
  variantId,
  quantity = 1,
  discountCode,
}: any) {
  const url = new URL(host);
  const id = variantId.replace(
    /gid:\/\/shopify\/ProductVariant\/([0-9]+)/,
    "$1"
  );

  /* The cart URL resolves to a checkout URL */
  url.pathname = `/cart/${id}:${quantity}`;

  if (discountCode) {
    url.searchParams.append("discount", discountCode);
  }

  return url.toString();
}
