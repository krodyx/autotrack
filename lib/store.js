/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


import EventEmitter from './event-emitter';
import {assign} from './utilities';


const AUTOTRACK_PREFIX = 'autotrack';
const instances = {};
let isListening = false;


/**
 * A storage object to simplify interacting with localStorage.
 */
export default class Store extends EventEmitter {
  /**
   * Gets an existing instance for the passed arguements or creates a new
   * instance if one doesn't exist.
   * @param {!Tracker} tracker The analytics.js tracker object.
   * @param {string} namespace A namespace unique to this store.
   * @param {!Object=} defaults An optional object of key/value defaults.
   * @return {Store} The Store instance.
   */
  static getOrCreate(tracker, namespace, defaults = {}) {
    const trackingId = tracker.get('trackingId');
    const key = [AUTOTRACK_PREFIX, trackingId, namespace].join(':');

    // Don't create multiple instances for the same tracking Id and namespace.
    if (!instances[key]) {
      instances[key] = new Store(key, tracker, defaults);
      instances[key].key = key;
      if (!isListening) initStorageListener();
    }
    return instances[key];
  }

  /**
   * @param {string} key A key unique to this store.
   * @param {!Tracker} tracker The analytics.js tracker object.
   * @param {!Object} defaults A object of key/value defaults.
   */
  constructor(key, tracker, defaults) {
    super();
    this.key = key;
    this.tracker = tracker;
    this.defaults = defaults;
  }

  /**
   * Gets the data stored in localStorage for this store.
   * @return {!Object} The stored data merged with the defaults.
   */
  get() {
    try {
      // TODO(philipwalton): Implement schema migrations if/when a new
      // schema version is introduced.
      const storedItem = String(window.localStorage.getItem(this.key));
      return parse(storedItem, this.defaults);
    } catch(err) {
      trackError(this.tracker, err);
      return {};
    }
  }

  /**
   * Saves the passed data object to localStorage,
   * merging it with the existing data.
   * @param {Object} newData The data to save.
   */
  set(newData) {
    const oldData = this.get();
    const mergedData = assign(oldData, newData);

    try {
      window.localStorage.setItem(this.key, JSON.stringify(mergedData));
    } catch(err) {
      trackError(this.tracker, err);
    }
  }

  /**
   * Clears the data in localStorage for the current store.
   */
  clear() {
    try {
      window.localStorage.removeItem(this.key);
    } catch(err) {

    }
  }

  /**
   * Removes the store instance for the global instances map. If this is the
   * last store instance, the storage listener is also removed.
   * Note: this does not erase the stored data. Use `clear()` for that.
   */
  destroy() {
    delete instances[this.key];
    if (!Object.keys(instances).length) {
      removeStorageListener();
    }
  }
}


/**
 * Adds a single storage event listener and flips the global `isListening`
 * flag so multiple events aren't added.
 */
function initStorageListener() {
  window.addEventListener('storage', storageListener);
  isListening = true;
}


/**
 * Removes the storage event listener and flips the global `isListening`
 * flag so it can be re-added later.
 */
function removeStorageListener() {
  window.removeEventListener('storage', storageListener);
  isListening = false;
}


/**
 * The global storage event listener.
 * @param {!Event} event The DOM event.
 */
function storageListener(event) {
  const store = instances[event.key];
  if (store) {
    const oldData = parse(event.oldValue, store.defaults);
    const newData = parse(event.newValue, store.defaults);
    store.emit('externalSet', newData, oldData);
  }
}


/**
 * @param {!Tracker} tracker
 * @param {Error|Object=} err
 */
function trackError(tracker, err = {}) {
  // Only track storage errors on the test tracker.
  if (tracker.get('name') != 'test') return;

  /** @type {FieldsObj} */
  const fieldsObj = {
    eventCategory: 'Storage Error',
    eventAction: err.name,
    eventLabel: `${err.message}:\n${err.stack || '(no stack trace)'}`,
  };
  tracker.send('event', fieldsObj);
}


/**
 * Parses a source string as JSON and merges the result with the passed
 * defaults object. If an error occurs while
 * @param {string} source A JSON string of data.
 * @param {!Object} defaults An object of key/value defaults.
 * @return {!Object} The parsed data object merged with the passed defaults.
 */
function parse(source, defaults) {
  let data;
  try {
    data = /** @type {!Object} */ (JSON.parse(source));
  } catch(err) {
    data = {};
  }
  return assign({}, defaults, data);
}
