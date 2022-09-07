'use strict';

const assert = require('assert');
const path = require('path');
const urlJoin = require('url-join');
const express = require('express');
const asyncHandler = require('../lib/express-async-handler');
const StatusError = require('../lib/status-error');

const timeoutMiddleware = require('./timeout-middleware');

const fetchRoomData = require('../lib/matrix-utils/fetch-room-data');
const fetchEventsInRange = require('../lib/matrix-utils/fetch-events-in-range');
const ensureRoomJoined = require('../lib/matrix-utils/ensure-room-joined');
const renderHydrogenVmRenderScriptToPageHtml = require('../hydrogen-render/render-hydrogen-vm-render-script-to-page-html');

const config = require('../lib/config');
const basePath = config.get('basePath');
assert(basePath);
const matrixAccessToken = config.get('matrixAccessToken');
assert(matrixAccessToken);
const archiveMessageLimit = config.get('archiveMessageLimit');
assert(archiveMessageLimit);

const router = express.Router({
  caseSensitive: true,
  // Preserve the req.params values from the parent router.
  mergeParams: true,
});

function parseArchiveRangeFromReq(req) {
  const yyyy = parseInt(req.params.yyyy, 10);
  // Month is the only zero-based index in this group
  const mm = parseInt(req.params.mm, 10) - 1;
  const dd = parseInt(req.params.dd, 10);

  const hourRange = req.params.hourRange;

  let fromHour = 0;
  let toHour = 0;
  if (hourRange) {
    const hourMatches = hourRange.match(/^(\d\d?)-(\d\d?)$/);

    if (!hourMatches) {
      throw new StatusError(404, 'Hour was unable to be parsed');
    }

    fromHour = parseInt(hourMatches[1], 10);
    toHour = parseInt(hourMatches[2], 10);

    if (Number.isNaN(fromHour) || fromHour < 0 || fromHour > 23) {
      throw new StatusError(404, 'From hour can only be in range 0-23');
    }
  }

  const fromTimestamp = Date.UTC(yyyy, mm, dd, fromHour);
  let toTimestamp = Date.UTC(yyyy, mm, dd + 1, fromHour);
  if (hourRange) {
    toTimestamp = Date.UTC(yyyy, mm, dd, toHour);
  }

  return {
    fromTimestamp,
    toTimestamp,
    yyyy,
    mm,
    dd,
    hourRange,
    fromHour,
    toHour,
  };
}

router.get(
  '/event/:eventId',
  asyncHandler(async function (req, res) {
    // TODO: Fetch event to get `origin_server_ts` and redirect to
    // /!roomId/2022/01/01?at=$eventId
    res.send('todo');
  })
);

// Based off of the Gitter archive routes,
// https://gitlab.com/gitterHQ/webapp/-/blob/14954e05c905e8c7cb675efebb89116c07cfaab5/server/handlers/app/archive.js#L190-297
router.get(
  '/date/:yyyy(\\d{4})/:mm(\\d{2})/:dd(\\d{2})/:hourRange(\\d\\d?-\\d\\d?)?',
  timeoutMiddleware,
  asyncHandler(async function (req, res) {
    const roomIdOrAlias = req.params.roomIdOrAlias;
    assert(roomIdOrAlias.startsWith('!') || roomIdOrAlias.startsWith('#'));

    const { fromTimestamp, toTimestamp, hourRange, fromHour, toHour } =
      parseArchiveRangeFromReq(req);

    // If the hourRange is defined, we force the range to always be 1 hour. If
    // the format isn't correct, redirect to the correct hour range
    if (hourRange && toHour !== fromHour + 1) {
      // Pass through the query parameters
      let queryParamterUrlPiece = '';
      if (req.query) {
        queryParamterUrlPiece = `?${new URLSearchParams(req.query).toString()}`;
      }

      res.redirect(
        // FIXME: Can we use the matrixPublicArchiveURLCreator here?
        `${urlJoin(
          basePath,
          roomIdOrAlias,
          'date',
          req.params.yyyy,
          req.params.mm,
          req.params.dd,
          `${fromHour}-${fromHour + 1}`
        )}${queryParamterUrlPiece}`
      );
      return;
    }

    // TODO: Highlight tile that matches ?at=$xxx
    //const aroundId = req.query.at;

    // We have to wait for the room join to happen first before we can fetch
    // any of the additional room info or messages.
    await ensureRoomJoined(matrixAccessToken, roomIdOrAlias, req.query.via);

    // Do these in parallel to avoid the extra time in sequential round-trips
    // (we want to display the archive page faster)
    const [roomData, { events, stateEventMap }] = await Promise.all([
      fetchRoomData(matrixAccessToken, roomIdOrAlias),
      fetchEventsInRange(
        matrixAccessToken,
        roomIdOrAlias,
        fromTimestamp,
        toTimestamp,
        archiveMessageLimit
      ),
    ]);

    if (events.length >= archiveMessageLimit) {
      throw new Error('TODO: Redirect user to smaller hour range');
    }

    const hydrogenStylesUrl = urlJoin(basePath, '/css/hydrogen-styles.css');
    const stylesUrl = urlJoin(basePath, '/css/styles.css');
    const jsBundleUrl = urlJoin(basePath, '/js/entry-client-hydrogen.es.js');

    const pageHtml = await renderHydrogenVmRenderScriptToPageHtml(
      path.resolve(__dirname, '../../shared/hydrogen-vm-render-script.js'),
      {
        fromTimestamp,
        roomData,
        events,
        stateEventMap,
        config: {
          basePath: config.get('basePath'),
          matrixServerUrl: config.get('matrixServerUrl'),
        },
      },
      {
        title: `${roomData.name} - Matrix Public Archive`,
        styles: [hydrogenStylesUrl, stylesUrl],
        scripts: [jsBundleUrl],
      }
    );

    res.set('Content-Type', 'text/html');
    res.send(pageHtml);
  })
);

module.exports = router;
