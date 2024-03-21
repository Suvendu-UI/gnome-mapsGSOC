/* -*- Mode: JS2; indent-tabs-mode: nil; js2-basic-offset: 4 -*- */
/* vim: set et ts=4 sw=4: */
/*
 * Copyright (c) 2019 Marcus Lundblad.
 *
 * GNOME Maps is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * GNOME Maps is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with GNOME Maps; if not, see <http://www.gnu.org/licenses/>.
 *
 * Author: Marcus Lundblad <ml@update.uu.se>
 */

import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

import {Application} from './application.js';
import * as HTTP from './http.js';
import * as PhotonUtils from './photonUtils.js';
import * as Service from './service.js';
import * as Utils from './utils.js';

// HTTP session timeout (in seconds)
const TIMEOUT = 5;

export class GraphHopperGeocode {
    constructor() {
        this._session =
            new Soup.Session({ user_agent : 'gnome-maps/' + pkg.version,
                               timeout:     TIMEOUT });
        this._readService();
        this._limit = Application.settings.get('max-search-results');
    }

    search(string, latitude, longitude, cancellable, callback) {
        let url = this._buildURL(string, latitude, longitude);
        let msg = Soup.Message.new('GET', url);

        this._session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT,
                                          cancellable,
                                          (source, res) => {
            if (cancellable.is_cancelled())
                return;

            if (msg.get_status() !== Soup.Status.OK) {
                callback(null, msg.get_status());
            } else {
                try {
                    let buffer =
                        this._session.send_and_read_finish(res).get_data();
                    let result = this._parseMessage(Utils.getBufferText(buffer));

                    if (!result)
                        callback(null, null);
                    else
                        callback(result, null);
                } catch (e) {
                    Utils.debug('Error: ' + e);
                    callback(null, e);
                }
            }
        });
    }

    get attribution() {
        return Service.getService().graphHopperGeocode.attribution;
    }

    get attributionUrl() {
        return Service.getService().graphHopperGeocode.attributionUrl;
    }

    get name() {
        return 'GraphHopper Geocode';
    }

    get url() {
        return 'https://docs.graphhopper.com/#tag/Geocoding-API';
    }

    _parseMessage(message) {
        let json = JSON.parse(message);
        let result = [];
        let hits = json.hits;

        if (!hits || hits.length === 0) {
            Utils.debug('No hits in response');
            return null;
        }

        hits.forEach(hit => {
            let place = this._parseHit(hit);

            if (place)
                result.push(place);
        });

        return result;
    }

    _parseHit(hit) {
        let lat = hit.point.lat;
        let lon = hit.point.lng;

        return PhotonUtils.parsePlace(lat, lon, hit);
    }

    _buildURL(string, latitude, longitude) {
        let query = new HTTP.Query({ limit:   this._limit,
                                     locale:  this._language,
                                     q:       string,
                                     key:     this._apiKey
                                   });
        if (latitude !== null && longitude != null) {
            query.add('point', latitude + ',' + longitude);
            if (string)
                query.add('location_bias_scale', PhotonUtils.LOCATION_BIAS_SCALE);
        }

        return `${this._baseUrl}/api/1/geocode?${query.toString()}`;
    }

    _readService() {
        let graphHopperGeocode = Service.getService().graphHopperGeocode;

        if (graphHopperGeocode) {
            this._baseUrl = graphHopperGeocode.baseUrl;
            this._apiKey = graphHopperGeocode.apiKey;

            let language = Utils.getLanguage();
            let supportedLanguages =
                graphHopperGeocode.supportedLanguages ?? [];

            if (supportedLanguages.includes(language))
                this._language = language;
            else
                this._language = null;
        }
    }
}
