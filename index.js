var extend = require('xtend/mutable');
var q = require('component-query');
var doc = require('get-doc');
var root = doc && doc.documentElement;
var cookie = require('cookie-cutter');
var ua = require('ua-parser-js');

// IE < 11 doesn't support navigator language property.
var userLangAttribute = navigator.language || navigator.userLanguage || navigator.browserLanguage;
var userLang = userLangAttribute.slice(-2) || 'us';

// platform dependent functionality
var mixins = {
	ios: {
		appMeta: 'apple-itunes-app',
		iconRels: ['apple-touch-icon-precomposed', 'apple-touch-icon'],
		getStoreLink: function() {
			return 'https://itunes.apple.com/' + this.options.appStoreLanguage + '/app/id' + this.appId;
		}
	},
	android: {
		appMeta: 'google-play-app',
		iconRels: ['android-touch-icon', 'apple-touch-icon-precomposed', 'apple-touch-icon'],
		getStoreLink: function() {
			return 'http://play.google.com/store/apps/details?id=' + this.appId;
		}
	},
	windows: {
		appMeta: 'msApplication-ID',
		iconRels: ['windows-touch-icon', 'apple-touch-icon-precomposed', 'apple-touch-icon'],
		getStoreLink: function() {
			return 'http://www.windowsphone.com/s?appid=' + this.appId;
		}
	}
};

var SmartBanner = function(options) {
	var agent = ua(navigator.userAgent);
	this.options = extend({}, {
		daysHidden: 15,
		daysReminder: 90,
		appStoreLanguage: userLang, // Language code for App Store
		button: 'OPEN', // Text for the install button
		store: {
			ios: 'On the App Store',
			android: 'In Google Play',
			windows: 'In the Windows Store'
		},
		price: {
			ios: 'FREE',
			android: 'FREE',
			windows: 'FREE'
		},
		theme: '', // put platform type ('ios', 'android', etc.) here to force single theme on all device
		icon: '', // full path to icon image if not using website icon image
		force: '', // put platform type ('ios', 'android', etc.) here for emulation
		instanceId: '0',
		appId: {
			ios: undefined,
			android: undefined,
			windows: undefined
		},
		closeCallback: undefined,
		getHtml: this.getDefaultHtml,
		addContainerClassName: true,
		postRender: undefined
	}, options || {});

	if (this.options.force) {
		this.type = this.options.force;
	} else if (agent.os.name === 'Windows Phone' || agent.os.name === 'Windows Mobile') {
		this.type = 'windows';
	} else if (agent.os.name === 'iOS') {
		this.type = 'ios';
	} else if (agent.os.name === 'Android') {
		this.type = 'android';
	}

	// Don't show banner on ANY of the following conditions:
	// - device os is not supported,
	// - user is on mobile safari for ios 6 or greater (iOS >= 6 has native support for SmartAppBanner)
	// - running on standalone mode
	// - user dismissed banner
	if (!this.type
		|| ( this.type === 'ios' && agent.browser.name === 'Mobile Safari' && parseInt(agent.os.version) >= 6 )
		|| navigator.standalone
		|| cookie.get('smartbanner-closed-' + this.options.instanceId)
		|| cookie.get('smartbanner-installed')) {
		return;
	}

	extend(this, mixins[this.type]);

	// - If we dont have app id in meta, dont display the banner
	if (!this.parseAppId()) {
		return;
	}

	this.create();
	this.show();
};

SmartBanner.prototype = {
	constructor: SmartBanner,

	create: function() {
		var sb = doc.createElement('div');
		var theme = this.options.theme || this.type;

		if (this.options.addContainerClassName)
			// sb.className = 'smartbanner' + ' smartbanner-' + theme;
			sb.className = ' smartbanner-' + theme;
		sb.innerHTML = this.getHtml();

		//there isn’t neccessary a body
		if (doc.body) {
			doc.body.appendChild(sb);
		}
		else if (doc) {
			doc.addEventListener('DOMContentLoaded', function(){
				doc.body.appendChild(sb);
			});
		}

		this.options.postRender && this.options.postRender();

		q('.smartbanner-button', sb).addEventListener('click', this.install.bind(this), false);
		q('.smartbanner-close, .js-smartbanner-close', sb).addEventListener('click', this.close.bind(this), false);

	},
	getHtml: function() {
		var icon;

		if (this.options.icon) {
			icon = this.options.icon;
		} else {
			for (var i = 0; i < this.iconRels.length; i++) {
				var rel = q('link[rel="' + this.iconRels[i] + '"]');

				if (rel) {
					icon = rel.getAttribute('href');
					break;
				}
			}
		}
		
		var params = extend({
			icon: icon,
			link: this.getStoreLink(),
			inStore: this.options.price[this.type] + ' - ' + this.options.store[this.type]
		}, this.options, {});
		
		if (this.options.getHtml)
			return this.options.getHtml(params);
		return this.getDefaultHtml(params)
	},
	getDefaultHtml: function(params) {
		return '<div class="smartbanner-container">' +
			'<a href="javascript:void(0);" class="smartbanner-close">&times;</a>' +
			'<span class="smartbanner-icon" style="background-image: url(' + params.icon + ')"></span>' +
			'<div class="smartbanner-info">' +
				'<div class="smartbanner-title">'+params.title+'</div>' +
				'<div>'+params.author+'</div>' +
				'<span>'+params.inStore+'</span>' +
			'</div>' +
			'<a href="'+params.link+'" class="smartbanner-button">' +
				'<span class="smartbanner-button-text">'+params.button+'</span>' +
			'</a>' +
		'</div>'
	},
	hide: function() {
		root.classList.remove('smartbanner-show');
	},
	show: function() {
		root.classList.add('smartbanner-show');
	},
	close: function() {
		this.hide();
		this.options.closeCallback && this.options.closeCallback();
		
		cookie.set('smartbanner-closed-' + this.options.instanceId, 'true', {
			path: '/',
			expires: new Date(+new Date() + this.options.daysHidden * 1000 * 60 * 60 * 24)
		});
	},
	install: function() {
		this.hide();
		cookie.set('smartbanner-installed', 'true', {
			path: '/',
			expires: new Date(+new Date() + this.options.daysReminder * 1000 * 60 * 60 * 24)
		});
	},
	parseAppId: function() {
		if (this.options.appId[this.type] !== undefined) {
			this.appId = this.options.appId[this.type];
			return this.appId;
		}
		var meta = q('meta[name="' + this.appMeta + '"]');
		if (!meta) {
			return;
		}

		if (this.type === 'windows') {
			this.appId = meta.getAttribute('content');
		} else {
			this.appId = /app-id=([^\s,]+)/.exec(meta.getAttribute('content'))[1];
		}

		return this.appId;
	}
};

module.exports = SmartBanner;
