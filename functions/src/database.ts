import * as admin from "firebase-admin";

let DATABASE: admin.database.Database | undefined = undefined;

export function database(): admin.database.Database {
  if (!DATABASE) {
    DATABASE = admin.initializeApp().database();
  }

  return DATABASE;
}
