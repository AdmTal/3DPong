/*
* Tween by Grant Skinner. Mar 7, 2011
* Visit http://easeljs.com/ for documentation, updates and examples.
*
*
* Copyright (c) 2010 Grant Skinner
* 
* Permission is hereby granted, free of charge, to any person
* obtaining a copy of this software and associated documentation
* files (the "Software"), to deal in the Software without
* restriction, including without limitation the rights to use,
* copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the
* Software is furnished to do so, subject to the following
* conditions:
* 
* The above copyright notice and this permission notice shall be
* included in all copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
* EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
* OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
* NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
* HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
* WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
* FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
* OTHER DEALINGS IN THE SOFTWARE.
*/

/**
* The Easel Javascript library provides a retained graphics mode for canvas 
* including a full, hierarchical display list, a core interaction model, and 
* helper classes to make working with Canvas much easier.
* @module EaselJS
**/

(function(window) {

/**
* Base class that all filters should inherit from.
* @class Tween
* @constructor
**/
Tween = function(target, css) {
  this.initialize(target, css);
}
var p = Tween.prototype;

// static interface:
	Tween._tweens = [];
	Tween.cssSuffixMap = {top:"px",left:"px"};

	/**
	* var tween2 = Tween.get(obj2).pause().to({alpha:1});
	* Tween.get(obj1).delay(2).to({x:50},4).call(onComplete).play(tween2).pause();
	* @param target
	*/
	Tween.get = function(target, css, override) {
		if (override && target.tweenjs_tweenCount) {
			var tweens = Tween._tweens;
			var l = tweens.length;
			for (var i=l-1; i>=0; i--) {
				if (tweens[i]._target == target) { tweens.splice(i,1); }
			}
			target.tweenjs_tweenCount = 0;
		}
		var tween = new Tween(target, css);
		Tween._register(tween, true);
		return tween;
	}

	if (window.Ticker) { Ticker.addListener(Tween); }
	Tween.tick = function(delta) {
		var tweens = Tween._tweens;
		var l =tweens.length;
		for (var i=l-1; i>=0; i--) {
			tweens[i].tick(delta);
		}
	}

	Tween._register = function(tween, value) {
		if (value) {
			if (tween._target.tweenjs_tweenCount == null) { tween._target.tweenjs_tweenCount = 1; }
			else { tween._target.tweenjs_tweenCount++; }
			Tween._tweens.push(tween);
		} else {
			tween._target.tweenjs_tweenCount--;
			var i = Tween._tweens.indexOf(tween);
			if (i != -1) { Tween._tweens.splice(i,1); }
		}
	}

// public properties:

// private properties:
	p._paused = false;
	p._curQueueProps = null;
	p._initQueueProps = null;
	p._steps = null;
	p._actions = null;
	p._prevPosition = 0;
	p._prevPos = -1;
	p._prevIndex = -1;
	p._target = null;
	p._duration = 0;
	p._css = false;
	
// constructor:
	/** 
	* Initialization method.
	* @method initialize
	* @protected
	**/
	p.initialize = function(target, css) {
		this._target = target;
		this._css = css;
		this._curQueueProps = {};
		this._initQueueProps = {};
		this._steps = [];
		this._actions = [];
		this._catalog = [];
	}
	
// public methods:

	// queues a delay.
	p.wait = function(duration) {
		if (duration == null || duration <= 0) { return this; }
		var o = this._cloneProps(this._curQueueProps);
		return this._addStep({d:duration, p0:o, e:this._linearEase, p1:o});
	}

	// queues a tween from the current values to the target properties. Set duration to 0 to jump to these value.
	p.to = function(props, duration, ease) {
		if (isNaN(duration) || duration < 0) { duration = 0; }
		return this._addStep({d:duration ? duration : 0, p0:this._cloneProps(this._curQueueProps), e:ease, p1:this._cloneProps(this._appendQueueProps(props))});
	}

	// queues a tween from the target properties to the current properties.
	p.from = function(props, duration, ease) {
		if (isNaN(duration) || duration < 0) { duration = 0; }
		return this._addStep({d:duration ? duration : 0, p1:this._cloneProps(this._curQueueProps), p0:this._cloneProps(this._appendQueueProps(props)), e:ease});
	}

	// queues an action to call the specified function
	p.call = function(callback, params, scope) {
		return this._addAction({f:callback, p:params ? params : [this], o:scope ? scope : this._target});
	}

	// queues an action to set the specified props on the specified target. If target is null, it will use this tween's target.
	p.set = function(props, target) {
		return this._addAction({f:this._set, o:this, p:[props, target ? target : this._target]});
	}

	// queues an action to play the specified tween.
	p.play = function(target) {
		return this.call(target.setPaused, [false], target);
	}

	// queues a pause action. If target is not specified, it defaults to the current tween.
	p.pause = function(target) {
		if (!target) { target = this; }
		return this.call(target.setPaused, [true], target);
	}

	
	// queues a loop of the full tween. Any actions queued after the loop will be ignored.
	p.loop = function() {
		this._loop = true;
		return this;
	}

	// advances the tween to a specified position in time.
	// if seek is true, then all actions between the previous position and the new one will be executed. If
	// it is false, then props will be updated without executing calls and play/pause actions.
	p.setPosition = function(value, seek) {
		if (value == this._prevPosition) { return; }
		if (seek == null) { seek = true; }
		var t = value;
		var looped = false;
		if (t > this._duration) {
			if (this._loop) {
				t = t%this._duration;
				looped = (t<this._prevPos);
			} else { t = this._duration; }
		}
		if (t != this._prevPos) {
			if (t == this._duration && !this._loop) {
				// addresses problems with an ending zero length step.
				this._updateTargetProps(null,1);
			} else if (this._steps.length > 0) {
				// find our new tween index:
				for (var i=0, l=this._steps.length; i<l; i++) {
					if (this._steps[i].t > t) { break; }
				}
				var tween = this._steps[i-1];
				this._updateTargetProps(tween,(t-tween.t)/tween.d);
			}
		}

		// GDS: deal with actions, looping, and reverse properly!
		if (seek && this._actions.length > 0) {
			if (looped) {
				this._runActions(this._prevPos, this._duration);
				this._runActions(0, t);
			} else {
				this._runActions(this._prevPos, t);
			}
		}
		this._prevPos = t;
		this._prevPosition = value;

		if (t == this._duration && !this._loop) {
			this.setPaused(true);
		}
	}

	p.tick = function(delta) {
		if (this._paused) { return; }
		this.setPosition(this._prevPosition+delta);
	}

	// pauses or plays this tween.
	p.setPaused = function(value) {
		this._paused = !!value;
		Tween._register(this, !value);
	}

	// tiny api (primarily for tool output):
	p.w = p.wait;
	p.f = p.from;
	p.t = p.to;
	p.p = p.pause;
	p.pl = p.play;
	p.c = p.call;
	p.s = p.set;
	p.l = p.loop;

	/**
	* Returns a string representation of this object.
	* @method toString
	* @return {String} a string representation of the instance.
	**/
	p.toString = function() {
		return "[Tween]";
	}
	
	/**
	* Returns a clone of this Tween instance.
	* @method clone
	* @return {Tween} A clone of the current Tween instance.
	**/
	p.clone = function() {
		// TODO: NOT IMPLEMENTED.
		return new Tween();
	}

// private methods:
	p._updateTargetProps = function(tween, ratio) {
		if (this._css) { var map = this.cssSuffixMap || Tween.cssSuffixMap; }
		var p0,p1,v0,v1;
		if (!tween && ratio == 1) {
			p0 = p1 = this._curQueueProps;
		} else {
			// apply ease to ratio.
			if (tween.e) { ratio = tween.e(ratio,0,1,1); }
			p0 = tween.p0;
			p1 = tween.p1;
		}

		for (n in this._initQueueProps) {
			if ((v0=p0[n]) == (v1=p1[n]) || ratio == 0 || ratio == 1) {
				// no interpolation - either at start, end, or values don't change.
				if (ratio == 1) { v0 = v1; }
				if (v0 == null) { v0 = this._initQueueProps[n]; }
			} else {
				if (v0 == null) { p0[n] = v0 = this._initQueueProps[n]; }
				v0 += (v1-v0)*ratio;
			}
			this._target[n] = map && map[n] ? v0+map[n] : v0;
		}
		
	}
		// GDS: there is a bug that causes actions at the start of a looping tween to be ignored.
	p._runActions = function(startPos, endPos, includeStart) {
		var sPos = startPos;
		var ePos = endPos;
		var i = -1;
		var j = this._actions.length;
		var k = 1;
		if (startPos > endPos) {
			// running backwards, flip everything:
			sPos = endPos;
			ePos = startPos;
			i = j;
			j = k = -1;
		}
		while ((i+=k) != j) {
			var action = this._actions[i];
			var pos = action.t;
			if ( (pos > sPos && pos <= ePos) || (includeStart && pos == startPos) ) {
				action.f.apply(action.o, action.p);
			}
		}
	}

	p._appendQueueProps = function(o) {
		if (this._css) { var map = this.cssSuffixMap || Tween.cssSuffixMap; }
		var sfx0,sfx1;
		for (var n in o) {
			if (this._initQueueProps[n] == null) {
				if (map && (sfx0 = map[n])) {
					// css string.
					var str = this._target[n];
					var i = str.length-sfx0.length;
					if ((sfx1 = str.substr(i)) != sfx0) {
						throw("TweenJS Error: Suffixes do not match. ("+sfx0+":"+sfx1+")");
					} else {
						this._initQueueProps[n] = parseInt(str.substr(0,i));
					}
				} else {
					this._initQueueProps[n] = this._target[n];
				}
			}
			this._curQueueProps[n] = o[n];
		}
		return this._curQueueProps;
	}

	p._cloneProps = function(props) {
		var o = {};
		for (var n in props) {
			o[n] = props[n];
		}
		return o;
	}

	p._addStep = function(o) {
		if (o.d > 0) {
			this._steps.push(o);
			o.t = this._duration;
			this._duration += o.d;
		}
		return this;
	}
	
	p._addAction = function(o) {
		o.t = this._duration;
		this._actions.push(o);
		return this;
	}

	p._set = function(props,o) {
		for (var n in props) {
			o[n] = props[n];
		}
	}
	
window.Tween = Tween;
}(window));