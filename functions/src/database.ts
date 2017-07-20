import * as functions from "firebase-functions";
import * as firebase_admin from "firebase-admin";
export const database = firebase_admin
  .initializeApp(functions.config().firebase)
  .database();
