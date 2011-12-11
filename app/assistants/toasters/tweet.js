var TweetToaster = Class.create(Toaster, {
	initialize: function(tweet, assistant) {
		this.id = toasterIndex++;
		this.nodeId = 'toaster-' + this.id;
		this.visible = false;
		this.shim = true;

		// We save the scene's assistant here
		this.assistant = assistant;
		this.controller = getController();
		this.user = this.controller.stageController.user;
		this.tweet = tweet;
		this.tweet.toasterId = this.id;

		if (this.tweet.retweet_count > 0) {
			this.tweet.rt_class = 'show';
		}
		else {
			this.tweet.rt_class = 'hide';
		}

		var th = new TweetHelper();

		// Process the tweet again for updates or whatever
		// this.tweet = th.process(this.tweet);

		this.content = {toasterId: this.id};

		var tweetHtml = Mojo.View.render({
			object: this.tweet,
			template: 'templates/tweets/details'
		});

		this.content.tweetHtml = tweetHtml;
		this.render(this.content, 'templates/toasters/tweet');

		// Stuff to do after the element is added to the DOM
		var currentUser = getUser();
		var me = currentUser.id;
		if (this.tweet.user.id_str === me) {
			this.controller.get(this.nodeId).addClassName('mine');
		}
		else if (this.tweet.dm) {
			this.controller.get(this.nodeId).addClassName('is-dm');
		}
		else {
			this.controller.get(this.nodeId).addClassName('normal');
		}

		if (this.tweet.favorited) {
			this.controller.get('favorite-' + this.id).addClassName('favorited');
		}

		if (this.tweet.in_reply_to_status_id_str !== null && this.tweet.in_reply_to_status_id_str) {
			this.controller.get(this.nodeId).addClassName('has-convo');
		}

		// Expand links if possible
		th.autoExpand(this.tweet, function(shortUrl, expandedUrl){
			this.tweet.text = this.tweet.text.replace(new RegExp(shortUrl, 'g'), expandedUrl);
			// re-render the tweet HTML
			var tweetHtml = Mojo.View.render({
				object: this.tweet,
				template: 'templates/tweets/details'
			});
			this.controller.get('details-' + this.id).update(tweetHtml);
			Mojo.Event.listen(this.controller.get('rt-' + this.id), Mojo.Event.tap, this.rtTapped.bind(this));
		}.bind(this));

	},
	actionTapped: function(event) {
		var action = event.srcElement.id.substr(0, event.srcElement.id.indexOf('-'));
		switch(action) {
			case 'reply':
				this.createReply();
				break;
			case 'retweet':
				this.createRetweet();
				break;
			case 'favorite':
				this.createFavorite();
				break;
			case 'dm':
				this.createMessage();
				break;
			case 'delete':
				this.deleteTweet();
				break;
			case 'convo':
				this.showConvo();
				break;
			case 'opts':
				this.showOpts();
				break;
			case 'back':
				this.assistant.toasters.back();
				break;
		}
	},
	createReply: function() {
		var statusText;

		var args = {
			'reply_id': this.tweet.id_str
		};

		if (this.tweet.entities && this.tweet.entities.user_mentions.length > 0) {
			// Reply all
			statusTxt = '@' + this.tweet.user.screen_name + ' ';
			var selectionStart = statusTxt.length;
			var selectionLength = 0;
			var currentUser = getUser();
			for (var i=0; i < this.tweet.entities.user_mentions.length; i++) {
				if (this.tweet.entities.user_mentions[i].screen_name !== currentUser.username) {
					statusTxt += '@' + this.tweet.entities.user_mentions[i].screen_name + ' ';
					selectionLength += this.tweet.entities.user_mentions[i].screen_name.length + 2;
				}
			}

			args.selectStart = selectionStart;
			args.selectEnd = selectionStart + selectionLength;
		}
		else {
			statusTxt = '@' + this.tweet.user.screen_name + ' ';
		}
		args.text = statusTxt;
		this.assistant.toasters.add(new ComposeToaster(args, this.assistant));
	},
	createMessage: function() {
		var args = {
			user: this.tweet.user,
			dm: true
		};
		this.assistant.toasters.add(new ComposeToaster(args, this.assistant));
	},
	createRetweet: function() {
		var th = new TweetHelper();
		var rt = th.isRetweeted(this.tweet, this.user);
		if (rt === false) {
			this.assistant.toasters.add(new RetweetToaster(this.tweet, this.assistant));
		}
		else if (rt === true) {
			var opts = {
				title: 'Are you sure you want to undo this retweet?',
				callback: function() {
					var Twitter = new TwitterAPI(this.user);
					var id = this.tweet.original_id;
					Twitter.action('destroy', id, function(r){
						var rts = this.user.retweeted;
						for (var i=0; i < rts.length; i++) {
							if (rts[i] === this.tweet.id_str) {
								rts.splice(i, 1);
							}
						}
						this.assistant.toasters.back();
						banner('Retweet was removed successfully');
					}.bind(this));
				}.bind(this)
			};
			this.assistant.toasters.add(new ConfirmToaster(opts, this.assistant));
		}
	},
	createFavorite: function() {
		var Twitter = new TwitterAPI(this.user);
		if (this.tweet.favorited === false) {
			Twitter.action('favorite', this.tweet.id_str, function(response, meta){
				this.tweet.favorited = true;
				this.controller.get('favorite-' + this.id).addClassName('favorited');
			}.bind(this));
		}
		else {
			Twitter.action('unfavorite', this.tweet.id_str, function(response){
				this.tweet.favorited = false;
				this.controller.get('favorite-' + this.id).removeClassName('favorited');
			}.bind(this));
		}
	},
	hideTweet: function() {
		for (var i=0; i < this.assistant.panels.length; i++) {
			var panel = this.assistant.panels[i];

			if (panel.type === 'timeline') {
				for (var j=0; j < panel.model.items.length; j++) {
					var item = panel.model.items[j];
					if (item.id_str === this.tweet.id_str) {
						panel.model.items.splice(j, 1);

						this.controller.modelChanged(panel.model);
						break;
					}
				}
			}
		}
	},
	deleteTweet: function() {
		var Twitter = new TwitterAPI(this.user);
		var opts = {
			title: 'Are you sure you want to delete this tweet?',
			callback: function(){
				this.assistant.toasters.back();

				Twitter.action('destroy', this.tweet.id_str, function(response) {
					banner('No one will ever know...'); //except the people who already saw it!
					this.assistant.toasters.back();

					this.hideTweet();
				}.bind(this), this.assistant);
			}.bind(this)
		};
		this.assistant.toasters.add(new ConfirmToaster(opts, this.assistant));
	},
	showConvo: function() {
		this.assistant.toasters.add(new ConvoToaster(this.tweet, this.assistant));
	},
	showOpts: function() {
		this.controller.popupSubmenu({
			onChoose: this.popupHandler.bind(this),
			placeNear: this.controller.get('opts-' + this.id),
			items: this.menuItems
		});
	},
	popupHandler: function(command) {
		switch (command) {
			case 'cmdMention':
				this.mention();
				break;
			case 'cmdMessage':
				this.message();
				break;
			case 'cmdBlock':
				this.block();
				break;
			case 'cmdSpam':
				this.spam();
				break;
			case 'cmdHide':
				this.hideTweet();
				break;
			case 'cmdCopy':
				this.copy();
				break;
			case 'cmdCopyUrl':
				this.copyUrl();
				break;
			case 'cmdPaperMache':
				this.addToPaperMache();
				break;	
			case 'cmdReadOnTouchPro':
				this.addToReadOnTouchPro();
				break;	
			case 'cmdEmail':
				this.email();
				break;
			case 'cmdSms':
				this.sms();
				break;
		}
	},
	mention: function() {
		var opts = {
			text: '@' + this.tweet.user.screen_name + ' '
		};
		this.assistant.toasters.add(new ComposeToaster(opts, this.assistant));
	},
	message: function() {
		var args = {
			user: this.tweet.user,
			dm: true
		};
		this.assistant.toasters.add(new ComposeToaster(args, this.assistant));
	},
	block: function() {
		var opts = {
			title: 'Are you sure you want to block @' + this.tweet.user.screen_name + '?',
			callback: function(){
				var Twitter = new TwitterAPI(this.user);
				Twitter.block(this.tweet.user.id_str, function(response){
					banner('Blocked @' + this.tweet.user.screen_name);
					this.assistant.toasters.back();

					this.hideTweet();
				}.bind(this));
			}.bind(this)
		};

		this.assistant.toasters.add(new ConfirmToaster(opts, this.assistant));
	},
	spam: function() {
		var opts = {
			title: 'Are you sure you want to report @' + this.tweet.user.screen_name + '?',
			callback: function(){
				var Twitter = new TwitterAPI(this.user);
				Twitter.report(this.tweet.user.id_str, function(response) {
					banner('Reported @' + this.tweet.user.screen_name);
					this.assistant.toasters.back();

					this.hideTweet();
				}.bind(this));
			}.bind(this)
		};

		this.assistant.toasters.add(new ConfirmToaster(opts, this.assistant));
	},
	//Copies the current tweet to the clipboard and shows a banner saying that it successfully copied the tweet
	copy: function() {
		this.controller.stageController.setClipboard(this.tweet.stripped,true);
				banner('Copied tweet to clipboard.');
	},
	addToPaperMache: function() {
		var Twitter = new TwitterAPI(this.user);
		var id = this.tweet.id_str;
		var request = new Mojo.Service.Request("palm://com.palm.applicationManager", {
    method:      'add',
    parameters:  {
        id: 'net.ryanwatkins.app.papermache',
        params: { url: "http://twitter.com/#!" + this.tweet.user.screen_name + "/" + "status/" + id}
    }
});
				banner('Added URL to Paper Mache');
	},
	addToReadOnTouchPro: function() {
		var Twitter = new TwitterAPI(this.user);
		var tweetid = this.tweet.id_str;
		//var this.readontouchid = "com.sven-ziegler.readontouch";
		var request = new Mojo.Service.Request("palm://com.palm.applicationManager", {
						method: 'open',
						parameters: {
							id: 'com.sven-ziegler.readontouch',
			params: {action: 'addLink', url: "http://twitter.com/#!" + this.tweet.user.screen_name + "/" + "status/" + tweetid}
						}});
				banner('Added URL to ReadOnTouch PRO');
	},
	copyUrl: function() {
		var Twitter = new TwitterAPI(this.user);
		var id = this.tweet.id_str;
		this.controller.stageController.setClipboard("http://twitter.com/#!" + this.tweet.user.screen_name + "/" + "status/" + id,true); 
				banner('Copied tweet URL to clipboard.');
	},
	//Sends the current tweet via email and adds the tag "Sent via Project Macaw for webOS"
	email: function() {
		this.controller.serviceRequest(
    "palm://com.palm.applicationManager", {
        method: 'open',
        parameters: {
            id: "com.palm.app.email",
            params: {
                summary: "I would like to share this tweet with you",
                text: this.tweet.stripped + "<br>" + " -- Sent via Project Macaw for webOS"
            }
        }
    }
);
	},
	//Sends the current tweet via SMS/Instant Message
	sms: function() {
		this.controller.serviceRequest('palm://com.palm.applicationManager', {
    method: 'launch',
    parameters: {
        id: 'com.palm.app.messaging',
        params: {
            messageText: this.tweet.stripped
        }
    },
    onSuccess: this.handleOKResponse,
    onFailure: this.handleErrResponse
});
	},


	detailsTapped: function(event) {
		var Twitter = new TwitterAPI(this.user);
		var e = event.target;
		var username;
		if (e.id === 'link') {
			var url = e.innerText;
			this.handleLink(url);
		}
		else if (e.id === 'hashtag') {
			var hashtag = e.innerText;
			Twitter.search(hashtag, function(response) {
				var opts = {
					type: 'search',
					query: hashtag,
					items: response.responseJSON.results,
					user: this.user
				};
				this.controller.stageController.pushScene('status', opts);
			}.bind(this));
		}
		else if (e.id === 'user-avatar') {
			// Have to load the user to get following details, etc, that aren't always returned with the tweet
			username = this.tweet.user.screen_name;
			Twitter.getUser(username, function(response) {
				this.controller.stageController.pushScene({name:'profile', disableSceneScroller: true}, response.responseJSON);
			}.bind(this));
		}
		else if (e.id === 'user') {
			username = e.innerText.substr(1);
			Twitter.getUser(username, function(response) {
				this.controller.stageController.pushScene({name:'profile', disableSceneScroller: true}, response.responseJSON);
			}.bind(this));

		}
	},
	handleLink: function(url) {
		//looks for images and other neat things in urls
		var img;
		if (url.indexOf('http://yfrog.com') > -1) {
			this.showPreview(url + ':iphone', url);
		}
		else if (url.indexOf('http://twitpic.com') > -1) {
			img = url.substr(url.indexOf('/', 8) + 1);
			this.showPreview('http://twitpic.com/show/large/' + img, url);
		}
		else if (url.indexOf('plixi') > -1 || url.indexOf('http://lockerz.com/s/') > -1) {
			this.showPreview('http://api.plixi.com/api/tpapi.svc/imagefromurl?size=large&url=' + url, url);
		}
		else if (url.indexOf('img.ly') > -1) {
			img = 'http://img.ly/show/full/' + url.substr(url.indexOf('.ly/') + 4);
			this.showPreview(img, url);
		}
		else if (url.indexOf('http://instagr.am/p/') > -1 || url.indexOf('http://instagram.com/p/') > -1) {
			this.showPreview(url + 'media/?size=l', url);
		}
		else if (url.indexOf('http://mlkshk.com/p/') > -1) {
			img = url.replace('/p/', '/r/');
			this.showPreview(img, url);
		}
		else if (url.indexOf('youtube.com/watch') > -1) {
			this.openYouTube(url);
		}
		else if (url.indexOf('youtu.be') > 1) {
			// YouTube app doesn't like the short URLs so let's convert it to a full URL
			var video = 'http://youtube.com/watch?v=' + url.substr(url.indexOf('.be/') + 4);
			this.openYouTube(video);
		}
		else if (url.indexOf('campl.us') > -1) {
			this.showPreview('http://phnxapp.com/services/preview.php?u=' + url);
		}
		else if (url.indexOf('.jpg') > -1 || url.indexOf('.png') > -1 || url.indexOf('.gif') > -1 || url.indexOf('.jpeg') > -1) {
			this.showPreview(url);
		}
		else if (url.indexOf('http://phnx.ws/') > -1) {
	      this.showPreview(url + '/normal');
	    }
		else{
			global.openBrowser(url);
		}
	},
	showPreview: function(src, url) {
		// this.assistant.imagePreview = true;
		// var img = new Image();
		// img.src = src;
		// this.controller.get('image-preview').show();
		// //try to preload the image
		// img.onLoad = this.showImage(src, url);
		this.controller.stageController.pushScene('pictureView', src);
	},
	showImage: function(src, url) {
		this.controller.get('preview').src = src;
		this.controller.get('preview').name = url;
		this.controller.get('image-preview').addClassName('rotate');
	},
	closePreview: function() {
		this.assistant.imagePreview = false;
		this.controller.get('image-preview').removeClassName('rotate');
		setTimeout(function() {
			this.controller.get('image-preview').hide();
		}, 1000);
	},
	previewTapped: function(event) {
		var e = event.target;
		global.openBrowser(e.name);
		this.closePreview();
	},
	openYouTube: function(url) {
		if (Mojo.Environment.DeviceInfo.platformVersionMajor < 3) {
			this.controller.serviceRequest("palm://com.palm.applicationManager", {
				method: "launch",
				parameters: {
					id: "com.palm.app.youtube",
					params: {
						target: url
					}
				}
			});
		} else {
			global.openBrowser(url);
		}
	},
	rtTapped: function(event) {
		var Twitter = new TwitterAPI(this.user);
		Twitter.showRetweets(this.tweet.id_str, function(response) {
			if (response.responseJSON.length > 0) {
				var users = [];
				var r = response.responseJSON;
				for (var i=0; i < r.length; i++) {
					users.push(r[i].user);
				}
				this.assistant.toasters.add(new UserListToaster('Status Retweets', users, this.assistant));
			}
			else {
				ex('Twitter did not return anything');
			}
		}.bind(this));
	},
	setup: function() {
		this.menuItems = [];

		this.menuItems.push({
			label: 'Public Mention',
			command: 'cmdMention'
		});
		this.menuItems.push({
			label: 'Send Direct Message',
			command: 'cmdMessage'
		});
		this.menuItems.push({
			label: 'Share',
			items: [
			{label: $L('Copy Text'), command:'cmdCopy'},
			{label: $L('Copy URL'), command:'cmdCopyUrl'},
			{label: $L('Add to Paper Mache'), command:'cmdPaperMache'},
			{label: $L('Add to ReadOnTouch PRO'), command:'cmdReadOnTouchPro'},
			{label: $L('Email'), command: 'cmdEmail'},
			{label: $L('SMS'), command: 'cmdSms'}
		]});
		this.menuItems.push({
			label: 'Block',
			command: 'cmdBlock'
		});
		this.menuItems.push({
			label: 'Report Spam',
			command: 'cmdSpam'
		});
		this.menuItems.push({
			label: 'Hide',
			command: 'cmdHide'
		});

		Mojo.Event.listen(this.controller.get('details-' + this.id), Mojo.Event.tap, this.detailsTapped.bind(this));
		Mojo.Event.listen(this.controller.get('rt-' + this.id), Mojo.Event.tap, this.rtTapped.bind(this));
		// Mojo.Event.listen(this.controller.get('preview'), Mojo.Event.tap, this.previewTapped.bind(this));
		Mojo.Event.listen(this.controller.get('reply-' + this.id), Mojo.Event.tap, this.actionTapped.bind(this));
		Mojo.Event.listen(this.controller.get('retweet-' + this.id), Mojo.Event.tap, this.actionTapped.bind(this));
		Mojo.Event.listen(this.controller.get('favorite-' + this.id), Mojo.Event.tap, this.actionTapped.bind(this));
		Mojo.Event.listen(this.controller.get('convo-' + this.id), Mojo.Event.tap, this.actionTapped.bind(this));
		Mojo.Event.listen(this.controller.get('dm-' + this.id), Mojo.Event.tap, this.actionTapped.bind(this));
		Mojo.Event.listen(this.controller.get('delete-' + this.id), Mojo.Event.tap, this.actionTapped.bind(this));
		Mojo.Event.listen(this.controller.get('back-' + this.id), Mojo.Event.tap, this.actionTapped.bind(this));
		Mojo.Event.listen(this.controller.get('opts-' + this.id), Mojo.Event.tap, this.actionTapped.bind(this));
	},
	cleanup: function() {
		Mojo.Event.stopListening(this.controller.get('details-' + this.id), Mojo.Event.tap, this.detailsTapped);
		Mojo.Event.stopListening(this.controller.get('rt-' + this.id), Mojo.Event.tap, this.rtTapped);
		// Mojo.Event.stopListening(this.controller.get('preview'), Mojo.Event.tap, this.previewTapped.bind(this));
		Mojo.Event.stopListening(this.controller.get('reply-' + this.id), Mojo.Event.tap, this.actionTapped);
		Mojo.Event.stopListening(this.controller.get('retweet-' + this.id), Mojo.Event.tap, this.actionTapped);
		Mojo.Event.stopListening(this.controller.get('favorite-' + this.id), Mojo.Event.tap, this.actionTapped);
		Mojo.Event.stopListening(this.controller.get('convo-' + this.id), Mojo.Event.tap, this.actionTapped);
		Mojo.Event.stopListening(this.controller.get('dm-' + this.id), Mojo.Event.tap, this.actionTapped);
		Mojo.Event.stopListening(this.controller.get('delete-' + this.id), Mojo.Event.tap, this.actionTapped);
		Mojo.Event.stopListening(this.controller.get('back-' + this.id), Mojo.Event.tap, this.actionTapped);
		Mojo.Event.stopListening(this.controller.get('opts-' + this.id), Mojo.Event.tap, this.actionTapped);
	}
});
