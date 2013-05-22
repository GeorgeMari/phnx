function AppAssistant(opts) {
	this.toasters = new ToasterChain();
}

AppAssistant.prototype = {
	setup: function() {
		var prefs = new LocalStorage();
	},
	handleLaunch: function(params, opts) {
		if (params.action === 'checkNotifications') {
			var prefs = new LocalStorage();
			var stageFocused = false; // temporaray

			if (prefs.read('notifications') && !stageFocused) {
				// Only background check notifications when enabled
				// and when there are no stages present
				this.checkNotifications();
			} else if (prefs.read('notifications') && stageFocused) {
				global.setTimer(); // reset the timer anyway
			}
		} else if (params.dockMode) {
			this.launchMain();
			// This is exhibition mode
//		} else if (params.composeTweet) {
		} else if (params.action === 'tweet') {
			// code for x-launch-params still work-in-progress
			Mojo.Log.error("Called Launch Param tweet correctly: " + params.msg);
			var prefs = new LocalStorage();	
			var defaultUser = prefs.read('defaultAccount');
			//this.launchMain();
			var am = new Account();
			var accounts;
			var user = {};

			am.all(function(r){
				accounts = r;
				if (accounts.length > 0) {
					//Mojo.Log.info('Starting app, accounts exist');
					// Push the main scene with the first account set as default.
					if (defaultUser !== '0') {
						for (var i=0; i < accounts.length; i++) {
							if (accounts[i].id === defaultUser) {
								user = accounts[i];
							}
						}
					}
					else {
						// Use the first user if an explicit default has not been chosen
						user = accounts[0];
					}
				}

				// Check if the user's stage is active & has scenes
				var appController = Mojo.Controller.getAppController();
				var userStage = appController.getStageProxy(global.mainStage + user.key);
				var userStageController = appController.getStageController(global.mainStage + user.key);
				if (userStage) {
					//Force new card composing until i can work out how to prevent the double compose toaster problem - last param set to true for new card
					//this.launchMain();
					if(userStageController) {
						userStageController.window.focus();
					}
					//OpenComposeToaster(this.toasters,{'from':user,'text':params.msg} , this);
					OpenComposeToaster(this.toasters,{'from':user,'text':params.msg} , this, true);
				} else {
					OpenComposeToaster(this.toasters,{'from':user,'text':params.msg} , this, true);
				}
			}.bind(this));
    } else if (params.action === 'searchUser') {
			// code for x-launch-params still work-in-progress
			/*		"search": {
			"displayName":	"Search User Project Macaw",
			"url":			"net.minego.phnx",
			"launchParam":	{ "action": "searchUser", "searchedUser":"#{searchTerms}" }
			}*/
			Mojo.Log.info("Called Launch Param searchUser correctly: " + params.searchedUser);
			var prefs = new LocalStorage();	
			var defaultUser = prefs.read('defaultAccount');
			this.launchMain();
			var am = new Account();
			var accounts;
			var user = {};

			am.all(function(r){
				accounts = r;
				if (accounts.length > 0) {
					//Mojo.Log.info('Starting app, accounts exist');
					// Push the main scene with the first account set as default.
					if (defaultUser !== '0') {
						for (var i=0; i < accounts.length; i++) {
							if (accounts[i].id === defaultUser) {
								user = accounts[i];
							}
						}
					}
					else {
						// Use the first user if an explicit default has not been chosen
						user = accounts[0];
					}
				}
				if (params.searchedUser.length > 0) {
					var Twitter = new TwitterAPI(user);
					Twitter.getUser(params.searchedUser, function(r){
						this.controller.getActiveStageController().pushScene({
							name: 'profile',
							disableSceneScroller: true
						}, r.responseJSON);
					}.bind(this));
				}
			}.bind(this));
    } else if (params.action === 'search') {
			// code for x-launch-params still work-in-progress
			/*		"search": {
			"displayName":	"Search Project Macaw",
			"url":			"net.minego.phnx",
			"launchParam":	{ "action": "search", "searchTerms":"#{searchTerms}" }
			}*/
			Mojo.Log.info("Called Launch Param search correctly: " + params.searchTerms);
			var prefs = new LocalStorage();	
			var defaultUser = prefs.read('defaultAccount');
			this.launchMain();
			var am = new Account();
			var accounts;
			var user = {};

			am.all(function(r){
				accounts = r;
				if (accounts.length > 0) {
					//Mojo.Log.info('Starting app, accounts exist');
					// Push the main scene with the first account set as default.
					if (defaultUser !== '0') {
						for (var i=0; i < accounts.length; i++) {
							if (accounts[i].id === defaultUser) {
								user = accounts[i];
							}
						}
					}
					else {
						// Use the first user if an explicit default has not been chosen
						user = accounts[0];
					}
				}
				if (params.searchTerms.length > 0) {
					var Twitter = new TwitterAPI(user);
					//var savedSearchesModel = {items: []};
					Twitter.getSavedSearches(function(response){
						savedSearchesModel.items = response.responseJSON;
					}.bind(this));
					Twitter.search(params.searchTerms, function(response) {
					// this.toasters.add(new SearchToaster(query, response.responseJSON, this));
						var opts = {
							type: 'search',
							query: params.searchTerms,
							items: response.responseJSON.statuses,
							user: user,
							//savedSearchesModel: savedSearchesModel, // Added by DC
							savedSearchesModel: null,
							assistant: this,
							controller: this.controller 
						};
						this.controller.getActiveStageController().pushScene('status', opts);
						this.controller.modelChanged(savedSearchesModel);
						//this.controller.get('saved-searches').show();
					}.bind(this));
				}
			}.bind(this));
    } else {
			Mojo.Log.info('params: ' + params);
			// Launch the app normally, load the default user if it exists.
			this.launchMain();
			//Removed line below - not quite sure why it was there.
			//this.toasters.add({}, new ComposeToaster(this));
			// this.checkNotifications(); // for debugging
		}
		var stageCallback = function(stageController) {
			Mojo.Log.error('RUNNING stageCallback');

			switch(params.action) {

				/**
				 * {
				 *   action:"tweet",
				 *   msg:"Some Text",
				 *   account:"ACCOUNT_HASH" // optional
				 * }
				 */
				case 'tweet':
						this.toasters.add(new ComposeToaster({
							'text':params.msg}, this
						));
					break;
			}
		};
	},
	handleCommand: function(event) {
		var stage = this.controller.getActiveStageController();

		if (event.command === 'cmdPreferences') {
			stage.pushScene('preferences');
		} else if (event.command === 'cmdPreferencesGeneral') {
			stage.pushScene('preferences', 'General Settings');
		} else if (event.command === 'cmdPreferencesAppearance') {
			stage.pushScene('preferences', 'Appearance');
		} else if (event.command === 'cmdPreferencesNotifications') {
			stage.pushScene('preferences', 'Notifications');
		} else if (event.command === 'cmdPreferencesAdvanced') {
			stage.pushScene('preferences', 'Advanced Settings');
		} else if (event.command === 'cmdAbout') {
			stage.pushScene('about');
		} else if (event.command === 'cmdSupport') {
			stage.pushScene('help');
		}
	},
	launchMain: function() {
		var prefs = new LocalStorage();
		this.userCookie = new Mojo.Model.Cookie('phoenixFirstRun');

		var user = {};

		var defaultUser = prefs.read('defaultAccount');

		// The app poops out on very first load if the Lawnchair store doesn't exist.
		// Using a cookie to get around this...
		if (typeof(this.userCookie.get()) !== "undefined") {
			var am = new Account();
			var accounts;
			am.all(function(r){
				accounts = r;
				if (accounts.length > 0) {
					Mojo.Log.info('Starting app, accounts exist');
					// Push the main scene with the first account set as default.
					if (defaultUser !== '0') {
						for (var i=0; i < accounts.length; i++) {
							if (accounts[i].id === defaultUser) {
								user = accounts[i];
							}
						}
					}
					else {
						// Use the first user if an explicit default has not been chosen
						user = accounts[0];
					}

					Mojo.Log.info('User set as ' + user.screen_name);

					var launchArgs = {
						user: user,
						users: accounts
					};
					prefs.write('defaultAccount', user.id);
					var stageName = global.mainStage + user.key;

					this.pushStage(stageName, launchArgs);
				}
				else {
					this.launchNew();
				}
			}.bind(this));
		} else {
			// This is the very first time the app is being launched,
			// so just init the Lawnchair store

			// Set the cookie, too.
			this.userCookie.put({
				run: true
			});

			var store = new Lawnchair('phnxAccounts');
			this.launchNew();
		}

	},
	launchNew: function() {
		var launchArgs = {};
		var stageName = global.authStage;
		this.pushStage(stageName, launchArgs);
	},
	pushStage: function(stageName, launchArgs) {
		var args = {
			name: stageName,
			lightweight: true
		};

		var pushMainScene = function(stageController) {
			if (stageName !== global.authStage) {
				global.stageActions(stageController);
			}
			stageController.pushScene('launch', launchArgs);
		};

		var userStage = this.controller.getStageProxy(stageName);
		if (!userStage) {
			this.controller.createStageWithCallback(args, pushMainScene, "card");
		} else {
			userStage.activate();
		}
	},
	checkNotifications: function() {
		// Check for notifications
		Mojo.Log.info('Checking notifications');
		var prefs = new LocalStorage();

		am = new Account();
		am.all(function(r){

			var callback = function(response, meta) {
				if (response.responseJSON.length > 0) {
					prefs.write(meta.user.id + '_' + meta.resource.name, response.responseJSON[0].id_str);
					this.createDashboard(meta.resource, response.responseJSON, meta.user, r);
				}
			};

			for (var i=0; i < r.length; i++) {
				var user = r[i];
				Mojo.Log.info('Checking ' + user.username + ' notifications');

				// Name matches panel IDs in main-assistant
				// Noun is used in dashboard title
				var resources = [
					{name: 'home', noun: 'Tweet', lastId: prefs.read(user.id + '_home'), enabled: prefs.read('notificationHome')},
					{name: 'mentions', noun: 'Mention', lastId: prefs.read(user.id + '_mentions'), enabled: prefs.read('notificationMentions')},
					{name: 'messages', noun: 'Direct Message', lastId: prefs.read(user.id + '_messages'), enabled: prefs.read('notificationMessages')}
				];

				for (var j=0; j < resources.length; j++) {
					var resource = resources[j];
					if (resource.enabled && resource.lastId !== null) {
						Mojo.Log.info('Checking ' + resource.name + ' last ID:' + resource.lastId);
						var Twitter = new TwitterAPI(user);
						Twitter.notificationCheck(resource, callback.bind(this), {"since_id": resource.lastId}, user);
					}
				}
			}
		}.bind(this));

		// Reset the alarm
		global.setTimer();
	},
	createDashboard: function(resource, items, account, accounts) {
		var appController = Mojo.Controller.getAppController();
		var dashboardStage = appController.getStageProxy(global.dashboardStage);

		var userId;

		if (items[0].user) {
			userId = items[0].user.id_str;
		}
		else if (items[0].sender) {
			userId = items[0].sender.id_str;
		}

		// Check if the user's stage is active & has scenes
		var userStage = appController.getStageProxy(global.mainStage + userId);

		if (userStage && userStage.isActiveAndHasScenes()) {
			userStage.delegateToSceneAssistant('refreshPanelId', resource.name);
		}
		else {
			if (dashboardStage) {
				dashboardStage.delegateToSceneAssistant('update', items, resource, account, accounts);
			}
			else {
				var pushDashboard = function(stageController){
					stageController.pushScene('dashboard', items, resource, account, accounts);
				};
				appController.createStageWithCallback({name: global.dashboardStage, lightweight: true}, pushDashboard, 'dashboard');
			}
		}
	}
};
