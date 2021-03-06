ActoExplaino.Views.ActivityShow = Backbone.CompositeView.extend({
  template: JST['activities/show'],
  errTemplate: JST['shared/errors'],

  initialize: function(options) {
    this.user = options.user;
    if (this.user.id && this.model.get('id')) {
      this.editable = (this.user.id === this.model.get('user_id'));
    } else {
      this.editable = false;
    }
    this.listenTo(this.user, 'change', this.checkUser);

    this.listenTo(this.model, 'sync', this.reload);
    this.listenTo(this.model, 'destroy', this.remove.bind(this));
    var that = this;
    this.listenTo(this.model.occurrences(), 'add', function (occurrence) {
      that.addOccurrence(occurrence, false);
    });
    this.listenTo(this.model.occurrences(), 'remove', this.deleteOccurrence);
    this.model.occurrences().each(function (occurrence) {
      that.addOccurrence(occurrence, false);
    });

    this.listenTo(this.model.matches(), 'sync', this.matchList);

    this._matchSubs = [];
    if (options.match) {
      this.match = options.match;
      this.addMatch();
    } else {
      this.match = new ActoExplaino.Models.Activity();
    }
    this.listenTo(this.match, 'sync', this.addMatch);

    // for setting occurrence details to open on default
    this.open = false;
    // tracks if form is open or not
    this._form = false;
    this._timelineShift = 0;
    this._scroll = 0;
    this.scrolling;
    this._timelineWindow = $(window).height() * .6;
    this._timelineLength = 0;
    this._scrolled = false;
    this.expanded = false;
  },

  events: {
    'click #add-new': 'toggleAddForm',
    'click #open-all': 'toggleAll',
    'click #add-submit': 'createOccurrence',
    'click #add-cancel': 'cancelForm',
    'click #match': 'matchShow',
    'mousemove .occurrences': 'updatePos',
    'dblclick .timeline-bar': 'toggleAddForm',
    'mousemove .scroll-down': 'scrollDown',
    'mouseleave .scroll-down': 'scrollStop',
    'mousemove .scroll-up': 'scrollUp',
    'mouseleave .scroll-up': 'scrollStop',
    'mousemove .timeline-window': 'timelineLength'
  },

  checkUser: function () {
    var that = this;
    this.editable = (this.user.id === this.model.get('user_id'));
    this.model.occurrences().each(function (occurrence) {
      var occurrenceView = _.find(
        that.subviews('.occurrences'),
        function (subview) {
          return subview.model === occurrence;
        }
      );
      occurrenceView.setEditable(that.editable);
      occurrenceView.render();
    });
    this.model.matches().fetch();
    this.render();
  },

  reload: function () {
    var that = this;
    this.editable = (this.user.id === this.model.get('user_id'));
    this.model.occurrences().each(function (occurrence) {
      var occurrenceView = _.find(
        that.subviews('.occurrences'),
        function (subview) {
          return subview.model === occurrence;
        }
      );
      occurrenceView.setEditable(that.editable);
      occurrenceView.render();
    });
    this.render();
  },

  remove: function () {
    Backbone.CompositeView.prototype.remove.call(this);
    clearInterval(this.scrolling);
    this.$('.timeline-window').off('mousewheel');
  },

  toggleAll: function () {
    if (this.expanded) {
      this.expanded = false;
      this.$('#open-all').html('+');
      this.subviews('.occurrences').forEach( function (subview) {
        if (subview.isOpen()) {
          subview.toggleDetails();
        }
      });
    } else {
      this.expanded = true;
      this.$('#open-all').html('-');
      this.subviews('.occurrences').forEach( function (subview) {
        if (!subview.isOpen()) {
          subview.toggleDetails();
        }
      });
    }
  },

  toggleAddForm: function (event) {
    if (event) {
      event.stopPropagation();
    }
    if (this.editable) {
      var $form = this.$('.occurrence-new');
      if (this._form) {
        $form.addClass('closed');
        this._form = false;
      } else {
        $form.removeClass('closed');
        this._form = true;
      }
    }
  },

  createOccurrence: function (event) {
    var that = this;
    event.preventDefault();
    var formData = $(event.target.parentElement).serializeJSON();
    var occurrence = new ActoExplaino.Models.Occurrence(formData);
    occurrence.save({}, {
      success: function () {
        that.open = true;
        $('#add')[0].reset();
        that.$('.errors').empty();

        that.model.occurrences().add(occurrence);
        that.toggleAddForm();
        that.model.matches().fetch();
      },
      error: function (obj, errors) {
        that.renderErrors(errors.responseJSON['errors']);
      }
    });
  },

  cancelForm: function (event) {
    event.preventDefault();
    this.toggleAddForm();
  },

  addOccurrence: function (occurrence, comparing) {
    var that = this;
    if (this._timelinePlaceholder && this.subviews('.occurrences').length === 0) {
      // this._timelinePlaceholder.empty();
      var height = '0';
      if (occurrence.get('date') === this._timelinePlaceholder.attr('id')) {
        height = '30';
      }
      this._timelinePlaceholder.animate(
        { "height" : height },
        { duration: 300, "complete" : function () {
            if ($.trim(that._timelinePlaceholder.html()) == '') {
              that._timelinePlaceholder.remove();
            }
          }
        }
      );
    }


    this.listenTo(occurrence, 'change:date', this.reorderOccurrence);
    var occurrenceView = new ActoExplaino.Views.Occurrence({
      model: occurrence,
      editable: this.editable,
      comparing: comparing,
      open: this.open || this.expanded
    });
    if (comparing) {
      this._matchSubs.push(occurrenceView)
    }
    this.addSubview('.occurrences', occurrenceView);
    this.open = false;
    this.model.matches().fetch();

  },

  deleteOccurrence: function (occurrence) {
    this.removeOccurrence(occurrence);
    this.model.matches().fetch();
  },

  removeOccurrence: function (occurrence) {
    var occurrenceView = _.find(
      this.subviews('.occurrences'),
      function (subview) {
        return subview.model === occurrence;
      }
    );
    this.removeSubview('.occurrences', occurrenceView);

    var that = this;
    if (this.subviews('.occurrences').length === 0) {
      this.$('.occurrences').append(this._timelinePlaceholder);
      this._timelinePlaceholder.addClass('center-text');
      this._timelinePlaceholder.append('.')
      this._timelinePlaceholder.animate(
        { "height" : that._timelineWindow / 3 },
        { duration: 300, "complete": function () {
            that.$('.occurrences').append(that._timelinePlaceholder);
            that._timelinePlaceholder.removeClass('center-text');
            that._timelinePlaceholder.html(that._dateLine);
          }
        }
      );
    }
  },

  reorderOccurrence: function (occurrence) {
    this.removeOccurrence(occurrence);
    this.open = true;
    this.addOccurrence(occurrence, false);
    this.model.matches().fetch();
  },

  // generates a list of matching timelines
  matchList: function() {
    var that = this;
    matchItems = this.subviews('#match-list')
    matchItems.forEach(function (subview) {
      that.removeSubview('#match-list', subview);
    });
    this.$('#match-list').empty();

    this.model.matches().each(function (match) {
        var matchItem = new ActoExplaino.Views.MatchItem({
          model: match,
          user: that.user
        });
        that.addSubview('#match-list', matchItem);
    });
  },

  // shows timeline for a selected match
  matchShow: function (event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    // var title = $(event.currentTarget).data('title');
    // var $title = $('<a>');
    var id = $(event.currentTarget).data('id');
    // Backbone.history.navigate('#/activities/' + this.model.id + '/matches/' + id, {trigger: false});
    // $title.attr('href', '#/activities/' + id);
    // $title.html(title);
    // this.$('#match-title').html($title);
    this.match.set({ id: id });
    this.match.fetch();
  },

  // updates match timeline after fetched
  addMatch: function () {
    var that = this;
    this._matchSubs.forEach(function (matchSub) {
      that.removeSubview('.occurrences', matchSub);
    });
    // this.$('.right-side').remove();
    this._matchSubs = [];

    // if($.trim(this.$('#match-title').html()) == '') {
      var title = this.match.get('title');
      var $title = $('<a>');
      var id = this.match.get('id');
      $title.attr('href', '#/activities/' + id);
      $title.html(title);
      this.$('#match-title').html($title);
    // }

    var that = this;
    this.$('#match-user').html('(' + this.match.get('email') + ')');
    this.match.occurrences().each(function (occurrence) {
      that.addOccurrence(occurrence, true);
    });
  },

  // ************************ rendering html *****************************

  render: function () {
    if (this.user.id && this.model.get('id')) {
      this.editable = (this.user.id === this.model.get('user_id'));
    } else {
      this.editable = false;
    }

    var content = this.template({ activity: this.model, user: this.user, editable: this.editable });
    this.$el.html(content);
    this.$el.addClass('row');
    // this.$('#match-title').empty();
    var $timeWindow = this.$('.timeline-window');
    $timeWindow.css('height', this._timelineWindow);
    $timeWindow.on('mousewheel', this.scrollWheel.bind(this));

    if (this.model.get('title')) {
      this.$('#show-title').html(this.model.get('title'));
      this.$('#show-user').html('(' + this.model.get('email') + ')');
    }

    var that = this;
    var date = new Date;
    var dateStr = date.getFullYear() + '-' + this.padStr(date.getMonth() + 1)
    + '-' + this.padStr(date.getDate());
    this._timelinePlaceholder = $('<div>');
    this._timelinePlaceholder.addClass('timeline');
    this._timelinePlaceholder.attr('id', dateStr);
    this.$('.occurrences').append(this._timelinePlaceholder);
    this._timelinePlaceholder.animate(
      { "height" : that._timelineWindow / 3 },
      { duration: 300 }
    );

    this._dateLine = $('<div>');
    this._dateLine.addClass('date-line');
    var $dateLabel = $('<div>');
    $dateLabel.addClass('date-label');
    $dateLabel.html(dateStr);
    this._dateLine.html($dateLabel);
    this._timelinePlaceholder.html(this._dateLine);

    if (!this.editable) {
      this.$('#add-new').prop('disabled', true);
    }
    this.matchList();
    this.attachSubviews();
    clearInterval(this.scrolling);
    var that = this;
    this.scrolling = setInterval(function() {
      that.scroll();
    }, 30);

    if (this.match.get('title')) {
      var title = this.match.get('title');
      var $title = $('<a>');
      var id = this.match.get('id');
      $title.attr('href', '#/activities/' + id);
      $title.html(title);
      this.$('#match-title').html($title);
      this.$('#match-user').html('(' + this.match.get('email') + ')');
    }

    return this;
  },

  renderErrors: function (errors) {
    var content = this.errTemplate({ errors: errors });
    this.$el.find('.errors').html(content);
  },


  // ********* timeline scrolling *************

  timelineLength: function () {
    this._timelineLength = this.$('.occurrences').height();
    if (this._timelineLength < this._timelineWindow) {
      this.$('.timeline-bar').height(this._timelineWindow);
    }
  },

  scrollStop: function () {
    this._scroll = 0;
  },

  scrollUp: function (event) {
    if (this._form) {
      this._scrolled = true;
      this.toggleAddForm();
    }

    var offset = 0;
    if (event.offsetY === undefined) {
      offset = event.pageY - $(event.currentTarget).offset().top;
    } else {
      offset = event.offsetY;
    }
    this._scroll = -((40 - offset) * 0.75);
  },

  scrollDown: function (event) {
    if (this._form) {
      this._scrolled = true;
      this.toggleAddForm();
    }


    var offset = 0;
    if (event.offsetY === undefined) {
      offset = event.pageY - $(event.currentTarget).offset().top;
    } else {
      offset = event.offsetY;
    }
    this._scroll = offset * 0.75;
  },

  checkScroll: function (delta) {
    if (delta < 0) {
      if (this._timelineShift < -(this._timelineWindow / 2)) {
        this._timelineShift = -(this._timelineWindow / 2);
      }
    } else if (delta > 0) {
      if (this._timelineShift < 0) {
      } else if (this._timelineLength > this._timelineWindow) {
        if (this._timelineShift > this._timelineLength - this._timelineWindow / 3) {
          this._timelineShift = this._timelineLength - (this._timelineWindow / 3);
        }
      } else if (this._timelineLength > this._timelineWindow / 3) {
        if (this._timelineLength - this._timelineShift < this._timelineWindow / 3 ) {
          this._timelineShift = this._timelineLength - (this._timelineWindow / 3);
        }
      } else if (this._timelineLength < this._timelineWindow / 3) {
        this._timelineShift = 0;
      }
    }
  },

  scroll: function () {
    this._timelineShift += this._scroll
    this.checkScroll(this._scroll);
    this.$('.timeline-bar').css('bottom', this._timelineShift);
  },

  padStr: function (i) {
    return (i < 10) ? "0" + i : "" + i;
  },

  updatePos: function (event) {
    var $timeline;

    if (this._scrolled){
      this.toggleAddForm();
      this._scrolled = false;
    }

    var offset = 0;
    if (event.offsetY === undefined) {
      offset = event.pageY - $(event.currentTarget).offset().top;
    } else {
      offset = event.offsetY;
    }

    if ($(event.target).attr('id')) {
      $timeline = $(event.target)
    } else if ($(event.target.parentElement).attr('id')) {
      $timeline = $(event.target.parentElement);
    } else {
      $timeline = $(event.target.parentElement.parentElement);
    }
    var dateHigh = new Date($timeline.attr('id'));
    var dateHigh;
    if ($timeline.next().attr('id')) {
      dateLow = new Date($timeline.next().attr('id'));
    } else {
      dateLow = dateHigh;
    }
    var height = parseFloat($timeline.css('height'));
    var pct = offset / height;
    var days = Math.floor(pct * (dateHigh - dateLow) / (3600 * 24 * 1000));
    dateHigh.setDate(dateHigh.getDate() - days + 1);
    var dateStr = dateHigh.getFullYear() + '-' + this.padStr(dateHigh.getMonth() + 1)
    + '-' + this.padStr(dateHigh.getDate());
    this.$('#new-date').val(dateStr);
    this.$('.occurrence-new').css('top', event.pageY - 200);
  },

  scrollWheel: function (event) {
    event.preventDefault();
    console.log(event.deltaX, event.deltaY, event.deltaFactor);
    var offset = event.deltaY > 0 ? 20 : -20;
    this._timelineShift -= offset;
    this.checkScroll(-offset);
    this.$('.timeline-bar').css('bottom', this._timelineShift);
  }
})
