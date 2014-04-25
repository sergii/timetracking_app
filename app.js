(function() {

  'use_strict';

  return {
    events: {
      'app.activated'           : 'onAppActivated',
      'app.deactivated'         : 'onAppFocusOut',
      'app.willDestroy'         : 'onAppWillDestroy',
      'ticket.save'             : 'onTicketSave',
      'ticket.form.id.changed'  : 'onTicketFormChanged',
      'click .pause'            : 'onPauseClicked',
      'click .resume'           : 'onResumeClicked',
      'click .reset'            : 'onResetClicked',
      'click .modal-save'       : 'onModalSaveClicked',
      'click .timelogs-opener'  : 'onTimeLogsContainerClicked',
      'shown .modal'            : 'onModalShown',
      'hidden .modal'           : 'onModalHidden'
    },

    /*
     *
     *  EVENT CALLBACKS
     *
     */
    onAppActivated: function(app) {
      if (app.firstLoad) {
        _.defer(this.initialize.bind(this));
      } else {
        this.onAppFocusIn();
      }
    },

    onAppWillDestroy: function() {
      clearInterval(this.timeLoopID);
    },

    onAppFocusOut: function() {
      if (this.setting('auto_pause_resume')) {
        this.autoPause();
      }
    },

    onAppFocusIn: function() {
      if (this.setting('auto_pause_resume') &&
         !this.manuallyPaused) {
        this.autoResume();
      }
    },

    onTicketFormChanged: function() {
      _.defer(this.hideFields.bind(this));
    },

    onTicketSave: function() {
      if (this.setting('time_submission')) {
        return this.promise(function(done, fail) {
          this.saveHookPromiseDone = done;
          this.saveHookPromiseFail = fail;

          this.renderTimeModal();
        }.bind(this));
      } else {
        this.updateTime(this.elapsedTime);

        return true;
      }
    },

    onPauseClicked: function(e) {
      var $el = this.$(e.currentTarget);

      $el.removeClass('pause').addClass('resume');
      $el.find('i').prop('class', 'icon-play');

      this.manuallyPaused = this.paused = true;
    },

    onResumeClicked: function(e) {
      var $el = this.$(e.currentTarget);

      $el.removeClass('resume').addClass('pause');
      $el.find('i').prop('class', 'icon-pause');

      this.manuallyPaused = this.paused = false;
    },

    onResetClicked: function() {
      this.elapsedTime = 0;
    },

    onTimeLogsContainerClicked: function(e) {
      var $el = this.$(e.currentTarget);

      if (!this.$('.timelogs-container').is(':visible')) {
        $el.addClass('active');
        this.$('.timelogs-container').show();
      } else {
        $el.removeClass('active');
        this.$('.timelogs-container').hide();
      }
    },

    onModalSaveClicked: function() {
      var timeString = this.$('.modal-time').val();

      try {
        this.updateTime(this.TimeHelper.timeStringToSeconds(timeString));
        this.saveHookPromiseIsDone = true; // Flag that saveHookPromiseDone is gonna be called after hiding the modal
        this.$('.modal').modal('hide');
        this.saveHookPromiseDone();
      } catch (e) {
        if (e.message == 'bad_time_format') {
          services.notify(this.I18n.t('errors.bad_time_format'), alert);
        } else {
          throw e;
        }
      }
    },

    onModalShown: function() {
      var timeout = 15,
          $timeout = this.$('span.modal-timer'),
          $modal = this.$('.modal');

      this.modalTimeoutID = setInterval(function() {
        timeout -= 1;

        $timeout.html(timeout);

        if (timeout === 0) {
          $modal.modal('hide');
        }
      }.bind(this), 1000);
    },

    onModalHidden: function() {
      clearInterval(this.modalTimeoutID);

      if (!this.saveHookPromiseIsDone) {
        this.saveHookPromiseFail(this.I18n.t('errors.save_hook'));
      }
    },

    /*
     *
     * METHODS
     *
     */

    initialize: function() {
      var timelogs = [];

      this.hideFields();

      this.timeLoopID = this.setTimeLoop();

      this.switchTo('main', {
        manual_pause_resume: this.setting('manual_pause_resume'),
        timelogs: timelogs,
        display_reset: this.setting('reset'),
        display_timer: this.setting('display_timer'),
        display_timelogs: this.setting('display_timelogs'),
        timelogs_csv_filename: helpers.fmt('ticket-timelogs-%@',
                                           this.ticket().id()),
        timelogs_csv_string: encodeURI(this.timelogsToCsvString(timelogs))
      });

      this.$('tr').tooltip({ placement: 'left', html: true });
    },

    updateMainView: function(time) {
      this.$('.live-timer').html(this.TimeHelper.secondsToTimeString(time));
      this.$('.live-totaltimer').html(this.TimeHelper.secondsToTimeString(
        this.totalTime() + time
      ));
    },

    hideFields: function() {
      _.each([this.timeFieldLabel(), this.totalTimeFieldLabel()], function(f) {
        var field = this.ticketFields(f);

        if (field) {
          field.hide();
        }
      }, this);
    },

    /*
     * TIME RELATED
     */

    setTimeLoop: function() {
      this.elapsedTime = 0;

      return setInterval(function() {
        if (!this.paused) {
          // Update elapsed time by 1 second
          this.elapsedTime += 1;

          this.updateMainView(this.elapsedTime);
        }
      }.bind(this), 1000);
    },

    updateTime: function(time) {
      this.time(time);
      this.totalTime(this.totalTime() + time);
    },

    autoResume: function() {
      this.paused = false;
    },

    autoPause: function() {
      this.paused = true;
    },

    renderTimeModal: function() {
      this.$('.modal-time').val(this.TimeHelper.secondsToTimeString(this.elapsedTime));
      this.$('.modal').modal('show');
    },

    /*
     *
     * HELPERS
     *
     */

    timelogsToCsvString: function(logs) {
      return _.reduce(logs, function(memo, log) {
        return memo + helpers.fmt('%@\n', [ log.time, log.submitter_name, log.date_submitted_at, log.status ]);
      }, 'Time,Submitter,Submitted At,status\n', this);
    },

    time: function(time) {
      return this.getOrSetField(this.timeFieldLabel(), time);
    },

    totalTime: function(time) {
      return this.getOrSetField(this.totalTimeFieldLabel(), time);
    },

    totalTimeFieldLabel: function() {
      return this.buidFieldLabel(this.setting('total_time_field_id'));
    },

    timeFieldLabel: function() {
      return this.buidFieldLabel(this.setting('time_field_id'));
    },

    buidFieldLabel: function(id) {
      return helpers.fmt('custom_field_%@', id);
    },

    getOrSetField: function(fieldLabel, value) {
      if (value) {
        return this.ticket().customField(fieldLabel, value);
      }

      return parseInt((this.ticket().customField(fieldLabel) || 0), 0);
    },

    TimeHelper: {
      secondsToTimeString: function(seconds) {
        var hours   = Math.floor(seconds / 3600),
            minutes = Math.floor((seconds - (hours * 3600)) / 60);
            secs    = seconds - (hours * 3600) - (minutes * 60);

        return helpers.fmt('%@:%@:%@',
                           this.addInsignificantZero(hours),
                           this.addInsignificantZero(minutes),
                           this.addInsignificantZero(secs));
      },

      timeStringToSeconds: function(timeString) {
        var re = /^([\d]{2}):([\d]{2}):([\d]{2})$/,
            result = re.exec(timeString);

        if (!result ||
            result.length != 4) {
          throw { message: 'bad_time_format' };
        } else {
          return (parseInt(result[1], 10) * 3600) +
            (parseInt(result[2], 10) * 60) +
            (parseInt(result[3], 10));
        }
      },

      addInsignificantZero: function(n) {
        return ( n < 10 ? '0' : '') + n;
      },

      prettyTimeLogs: function(logs) {
        return _.reduce(logs, function(memo, log) {
          var logDecorator = _.clone(log),
              submitted_at = new Date(log.submitted_at);

          logDecorator.date_submitted_at = submitted_at.toLocaleString();
          logDecorator.time = this.msToTime(log.time);

          memo.push(logDecorator);

          return memo;
        }, [], this);
      }
    }
  };
}());