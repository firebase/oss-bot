import * as firebase_admin from "firebase-admin";
let DATABASE: firebase_admin.database.Database | undefined = undefined;

export function database(): firebase_admin.database.Database {
  if (!DATABASE) {
    DATABASE = firebase_admin.initializeApp().database();
  }

  return DATABASE;
}
