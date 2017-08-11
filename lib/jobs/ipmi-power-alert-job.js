//  lib/task-data/base-tasks/ipmi-power-poller-alert.js
// Copyright 2015, EMC, Inc.

'use strict';

var di = require('di');

module.exports = pollerMessageCacheJobFactory;
di.annotate(pollerMessageCacheJobFactory, new di.Provide('Job.Poller.Alert.Ipmi.Power'));
di.annotate(pollerMessageCacheJobFactory, new di.Inject(
    'Job.Base',
    'Services.Configuration',
    'Logger',
    'Util',
    'Assert',
    'Errors',
    'Promise',
    '_'
));
function pollerMessageCacheJobFactory(
    BaseJob,
    configuration,
    Logger,
    util,
    assert,
    Errors,
    Promise,
    _
) {
    var logger = Logger.initialize(pollerMessageCacheJobFactory);

    /**
     * @param {Object} options
     * @param {Object} context
     * @param {String} taskId
     * @constructor
     */
    function PollerMessageCacheJob(options, context, taskId) {
        PollerMessageCacheJob.super_.call(this, logger, options, context, taskId);

        this.routingKey = context.graphId;
        assert.uuid(this.routingKey) ;
        this.cachedPowerState = {};
    }
    util.inherits(PollerMessageCacheJob, BaseJob);

    /**
     * @memberOf PollerMessageCacheJob
     */
    PollerMessageCacheJob.prototype.cacheSet = function(id, data) {
        if (!data) {
            return;
        }
        console.log("++++++++++++++ data" + JSON.stringify(data))
        var cache = this.cache[id];
        if (!cache) {
            cache = [];
            this.cache[id] = cache;
        }
        data.timestamp = Date();
        cache.push(data);
        if (cache.length > this.maxCacheSize) {
            cache.shift();
        }
    };

    /**
     * @memberOf PollerMessageCacheJob
     */
    PollerMessageCacheJob.prototype.cacheGet = function(id) {
        return this.cache[id];
    };

    /**
     * @memberOf PollerMessageCacheJob
     */
    PollerMessageCacheJob.prototype.cacheHas = function(id) {
        return _.has(this.cache, id);
    };

    /**
     * @memberOf PollerMessageCacheJob
     */
    PollerMessageCacheJob.prototype._run = function run() {
        // NOTE: this job will run indefinitely absent user intervention
        var self = this;
        console.log("++++++++++ go into power alert.")
        _.forEach(['power'], 
            function(command) {
            self._subscribeIpmiCommandResult(
                self.routingKey,
                command,
                self.createSetIpmiCommandResultCallback(command)
            );
        });
    
    };

    /**
     * @memberOf PollerMessageCacheJob
     */
    PollerMessageCacheJob.prototype.createSetIpmiCommandResultCallback = function(command) {
        var self = this;
        return function(data) {
            console.log("+++++++++++++++ get data from MQ, raw data:" + JSON.stringify(data));
            self.powerStateAlerter(data.power.status, data);
        };
    };
    
   /**
     * Compare current and last power states and publish alert on a state change
     * @memberOf IpmiJob
     * @param status
     * @param data
     */
     PollerMessageCacheJob.prototype.powerStateAlerter = Promise.method(function(status, data) {
        console.log("+++++++++++++++ alert raw data's status:" + JSON.stringify(status));
        console.log("+++++++++++++++ alert raw data:" + JSON.stringify(data));
        var self = this;
        var tmp = {};
        tmp.type = 'polleralert';
        tmp.action = 'chassispower.updated';
        tmp.typeId = data.workItemId;
        tmp.nodeId = data.node;
        tmp.severity = "information";
        tmp.data = {
            states: {
                last: self.cachedPowerState[data.workItemId],
                current: status
            }
        };
        console.log("++++++++++++++ tmp.data.states:" + JSON.stringify(tmp.data.states));
        if(self.cachedPowerState[data.workItemId] !== status) {
            console.log("++++++++++ triger an alert.....");
            console.log("++++++++++ alert content:" + JSON.stringify(tmp));
            self._publishPollerAlert(tmp);
            self.cachedPowerState[data.workItemId] = status;
        }
        return status;
    });

    return PollerMessageCacheJob;
}

