/**
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Firebase App (the core Firebase SDK) is always required and
// must be listed before other Firebase SDKs
import * as firebase from "firebase/app";

// Load required services into the firebase namespace.
import "firebase/auth";
import "firebase/firestore";

import { firebaseConfig } from '../../environments/environment';
import { StyleRule } from '../services/styles.service';

const SHARING_COLLECTION = 'GeoVizSharing';

export interface ShareableData {
  sharingVersion: string;
  projectID : string;
  jobID : string;
  location : string | undefined;
  styles: string;
  creationTimestampMs: number;
}

/**
 * Utility class for managing interaction with the Firestore.
 */
export class FirestoreService {
  private db: firebase.firestore.Firestore = null;

  constructor() {
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    this.db = firebase.firestore();
  }

  storeShareableData(shareableData : ShareableData) : Promise<string> {
    return this.db.collection(SHARING_COLLECTION).add(shareableData)
      .then(function(docRef) {
	return docRef.id;
      });
  }

  getSharedData(docId: string) : Promise<ShareableData> {
    return this.db.collection(SHARING_COLLECTION).doc(docId).get().then(function(doc) {
      if (!doc.exists) {
	  throw new Error('Shared visualization does not exist. Please check your URL!');
      }
      return doc.data() as ShareableData;
    });
  }

  authorize(credential: object) {
    const firebase_credential = firebase.auth.GoogleAuthProvider.credential(
      credential['id_token'],
      credential['access_token']
    );
    firebase.auth().signInWithCredential(firebase_credential)
  }
}
