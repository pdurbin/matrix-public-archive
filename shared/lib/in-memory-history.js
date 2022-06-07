'use strict';

const { BaseObservableValue } = require('hydrogen-view-sdk');
const assert = require('./assert');

// A Hydrogen History implementation that doesn't touch the URL. This way
// Hydrogen can still route internally while keeping our external facing URL the
// same.
//
// ex. https://hydrogen.element.io/#/session/123/room/!abc:m.org/lightbox/$abc
// and the hash is handling the `#/session/123/room/!abc:m.org/lightbox/$abc`
// part
class InMemoryHistory extends BaseObservableValue {
  #hash = '#/session/123/room/!abc:m.org';

  constructor(roomId) {
    super();

    assert(roomId);

    // Since we're viewing an archive of a room, let's mimic the URL of the room
    // view
    this.#hash = `#/session/123/room/${roomId}`;
  }

  handleEvent(event) {
    console.log('handleEvent event', event);
    if (event.type === 'hashchange') {
      this.#hash = document.location.hash;
      this.emit(this.get());
    }
  }

  get() {
    return this.#hash;
  }

  /** does not emit */
  replaceUrlSilently(url) {
    this.#hash = url;
    this.emit(this.get());
  }

  /** does not emit */
  pushUrlSilently(url) {
    this.#hash = url;
    this.emit(this.get());
  }

  pushUrl(url) {
    this.#hash = url;
    this.emit(this.get());
  }

  urlAsPath(url) {
    if (url.startsWith('#')) {
      return url.substr(1);
    } else {
      return url;
    }
  }

  pathAsUrl(path) {
    return `#${path}`;
  }

  onSubscribeFirst() {
    console.log('InMemoryHistory: onSubscribeFirst');
    window.addEventListener('hashchange', this);
  }

  onUnsubscribeLast() {
    window.removeEventListener('hashchange', this);
  }

  getLastUrl() {
    return this.#hash;
  }
}

module.exports = InMemoryHistory;
