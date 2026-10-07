import Autoloader from "./_Autoloader.js";
import Board from "./Board.js";
import Constants from "./Constants.js";
import Question from "./Question.js";
import Serial from "./Serial.js";
import Team from "./Team.js";
import Dexie from '../lib/dexie.min.js';
import Category from "./Category.js";
import UI from "./UI.js";
import State from "./State.js";



export default class Game extends Autoloader{

	static Serial = new Serial();
	static Stage = {
		Board : "Board",
		Question : "Question",
		DailyDouble : "DailyDouble",							// waiting for a player to bet
		Final : "Final",
		DailyDoubleCompleted : "DailyDoubleCompleted",			// Currently showing answer, waiting for enter to show what the wager was and modify score
		ShowWager : "ShowWager",								// Show wager for active team
		PresentingCategories : "PresentingCategories",
		FinalQuestionCategory : "FinalQuestionCategory",		// Present final jeopardy category to players
		FinalQuestion : "FinalQuestion",						// Present final jeopardy question with a timer.
		FinalQuestionAnswer : "FinalQuestionAnswer",			// Show answer for #answeringTeam
		FinalQuestionWager : "FinalQuestionWager",				// Show wager for #answeringTeam
		FinalScore : "FinalScore",								// Show the final score
	};

	static game;
	static ui;
	static db;
	static async begin(){

		this.db = new Dexie("jeopardy");
		this.db.version(1).stores({
			games : "id",
			categories : "id",
		});
		this.ui = new UI();
		this.draw(true);

		await State.begin();

		if( !await this.loadGame(localStorage.activeGame) )
			this.newGame("New Game");

	}

	static async loadGame( id ){

		if( !id )
			return false;

		const gameData = await this.db.games.get(id);
		if( !gameData )
			return false;
		
		localStorage.activeGame = id;
		if( this.game )
			this.game.onDeactivate();
		this.game = new Game(gameData);
		this.onGameLoaded();
		return true;

	}

	static async saveGame( game ){

		if( !(game instanceof Game) )
			throw new Error("saveGame called with non-Game object");
		return await this.db.games.put(game.dump());

	}

	static async saveActiveGame(){
		return this.saveGame(this.game);
	}

	static async draw( recache ){

		if( recache && this.game )
			this.game.recache();
		return this.ui.draw(this.game);

	}

	static async onGameLoaded(){

		this.ui.setGame(this.game);
		this.game.onActivate();

	}

	static async newGame( name ){

		this.game = new Game({
			name
		});
		const gameData = this.game.dump();
		await this.db.games.add(gameData);
		localStorage.activeGame = this.game.id;
		this.onGameLoaded();

	}

	static toggleEditMode( on ){

		if( on === undefined )
			on = !this.isEditMode();

		localStorage._editMode = +on || 0;
		this.draw();

	}

	static isEditMode(){
		return localStorage._editMode === '1';
	}


	// DB management
	// Create a new category and add it to active game
	static async dbCreateCategory( name ){
		
		const category = new Category({name});
		await this.dbSaveCategory(category);
		this.game.getActiveBoard().categories.push(category);
		this.draw(true);
		this.saveActiveGame();
		return category;

	}

	static async dbDeleteCategory( id ){
		await this.db.categories.delete(id);
	}

	static async dbGetAllCategories(){
		const arr = await this.db.categories.toArray();
		return arr.map(el => new Category(el));
	}

	static async dbGetCategoryById( id ){
		const cat = await this.db.categories.get(id);
		if( !cat )
			return false;
		return new Category(cat);
	}

	static async dbSaveCategory( category ){
		
		if( !(category instanceof Category) )
			throw new Error("saveCategory called with non-Category object");

		await this.db.categories.put(category.dump());

	}


	static async dbGetAllGames(){
		const arr = await this.db.games.toArray();
		return arr.map(el => new Game(el));
	}

	static async dbDeleteGame( id ){
		await this.db.games.delete(id);
	}


	// Shared data (questions etc)
	name = "";
	boards = [
		new Board(),
		new Board()
	];
	finalQuestion = new Question();
	finalQuestionCategory = '';

	// Game data
	id = crypto.randomUUID();
	dailyDoubles = new Set();			// Question IDs
	completedQuestions = new Set();		// Question IDs
	presentedCategories = new Set();
	nrDailyDoubles = 1;					// Per board
	answerTime = 6;						// Seconds to answer
	questionTime = 30;					// Seconds per question to answer
	activeBoard = 0;
	
	//stage = Game.Stage.Board;
	state = null;						// Current state label
	states = null;						// Sates loaded from /modules/states. Unique to the game.

	categoryTeam = 0;					// Team that's picking category. This is updated on question correct.
	minWager = 2000;					// Minimum max wager you can pick on finale or daily double
	
	#saveTimer = null;

	activeQuestion = '';				// ID - Used in multiple states, so it goes here
	activeQuestionType = Question.Type.Regular;	// Used in multiple states
	lastAnswerCorrect = false;			// Used for wagering
	answeringTeam = -1;					// (-1 = none) Use getAnsweringTeam(). Used by multiple states


	teams = [
		new Team({color:Constants.BUTTON_COLOR.RED}),
		new Team({color:Constants.BUTTON_COLOR.YELLOW}),
		new Team({color:Constants.BUTTON_COLOR.GREEN}),
		new Team({color:Constants.BUTTON_COLOR.BLUE}),
		new Team({color:Constants.BUTTON_COLOR.WHITE})
	];
	

	/* GAME DATA MANAGEMENT */
	constructor( data ){
		super(data);
		this.autoLoad(data);
	}

	dump(){

		const stateData = {};
		for( const label in this.states )
			stateData[label] = this.states[label].getSaveData();

		let out = {
			id : this.id,
			name : this.name,
			boards : Board.dumpThese(this.boards),
			finalQuestion : this.finalQuestion.dump(),
			finalQuestionCategory : this.finalQuestionCategory,
			id : this.id,
			dailyDoubles : Array.from(this.dailyDoubles),
			completedQuestions : Array.from(this.completedQuestions),
			presentedCategories : Array.from(this.presentedCategories),
			activeBoard : this.activeBoard,
			teams : Team.dumpThese(this.teams),
			nrDailyDoubles : this.nrDailyDoubles,
			categoryTeam : this.categoryTeam,
			stateData
		};

		return out;

	}

	draw( recache ){
		this.constructor.draw(recache);
	}

	// on loaded via autoloader
	async onLoaded( data ){
		
		if( !this.states )
			this.states = State.getStateObjects(this);

		if( data && data.stateData ){
		
			for( const label in data.stateData ){

				if( this.states[label] )
					this.states[label].loadSaveData(data.stateData[label]);

			}
			
		}

		
		this.boards = Board.loadThese(this.boards);
		this.teams = Team.loadThese(this.teams);
		this.teams.map(team => team.setDisplayMode(Team.Displaymode.Score));
		this.finalQuestion = new Question(this.finalQuestion);
		this.dailyDoubles = new Set(this.dailyDoubles);
		this.completedQuestions = new Set(this.completedQuestions);
		this.presentedCategories = new Set(this.presentedCategories);
		const promises = this.boards.map(b => b.loadCategories());
		await Promise.all(promises);
		
		
		if( !this.state )
			this.setState("board");
		this.draw(true);

	}


	resetIfNotStarted(){
		if( !this.isStarted() )
			this.reset();
	}

	// Ran when this game becomes the primary game for rendering
	onActivate(){
		
		this.recache();
		Game.Serial.onConnect = this.onSerialConnect.bind(this);
		Game.Serial.onRemoteMessage = this.onSerialConnect.bind(this);
		Game.Serial.onRemoteButton = this.onRemoteButton.bind(this);
		Game.Serial.onRemoteText = this.onRemoteText.bind(this);
		Game.Serial.onRemoteConnect = (color) => this.onSerialRemoteConnect(color, true);
		Game.Serial.onRemoteDisconnect = (color) => this.onSerialRemoteConnect(color, false);

	}

	// Recalculates question values
	recache(){
		
		for( let b = 0; b < this.boards.length; ++b )
			this.boards[b].recache(b);
		Game.draw();

	}

	reset(){

		this.activeBoard = 0;
		this.activeQuestion = '';

		this.categoryTeam = 0;
		this.dailyDoubles = new Set();
		this.completedQuestions = new Set();
		this.presentedCategories = new Set();
		const viableStartTeams = [];
		for( let team of this.teams ){

			team.reset();
			team.setDisplayMode(Team.Displaymode.Score);
			if( team.active )
				viableStartTeams.push(team.color);

		}

		for( let board of this.boards ){
			board.resetPresented();
		}

		if( viableStartTeams.length > 0 )
			this.categoryTeam = Game.randElem(viableStartTeams);

		if( this.nrDailyDoubles > 0 ){

			// Todo: Re-enable
			//const viableDailyDoubles = this.getAllQuestionIds();
			//Game.shuffle(viableDailyDoubles);
			//this.dailyDoubles = new Set(viableDailyDoubles.slice(0, this.nrDailyDoubles));
			this.dailyDoubles = new Set();
			this.dailyDoubles.add(this.boards[0].categories[0].questions[0].id); // testing

		}

		this.setAllDisplaysScore();

		this.draw(true);
		this.save();
		this.setState("board");

	}


	async onDeactivate(){
		
		const state = this.getState();
		if( state )
			await state.execStateExit();
		
	}

	save(){
		clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => Game.saveGame(this), 500);
	}

	hasFinalQuestion(){
		return this.finalQuestion.isValid() && this.finalQuestionCategory;
	}




	/* GAMEPLAY */
	isStarted(){
		return this.teams.some(team => team.score !== 0) || this.completedQuestions.size > 0;
	}

	isOnLastBoard(){
		return this.activeBoard >= this.boards.length-1;
	}

	advanceBoard(){

		++this.activeBoard;
		this.activeBoard = this.activeBoard % this.boards.length;
		this.draw(true);
		this.save();

	}

	async setState( id, cdata = {} ){
		
		if( !this.states[id] )
			throw new Error("Invalid state: "+id);

		const existing = this.getState();
		if( existing )
			await existing.execStateExit();
		
		this.state = id;
		const state = this.getState();

		for( const key in cdata )
			state.cdata[key] = cdata[key];

		await state.execStateEntry();
		state.updateControls();

		this.save();
		this.draw();

	}

	getState(){
		return this.states[this.state];
	}







	/* INPUT EVENT BINDINGS */

	// return true if we captured it
	onKeyPress( key ){

		if( Game.isEditMode() )
			return;

		const state = this.getState();
		if( !state )
			return;

		return state.onKeyPress(key);

	}


	// Events from serial device
	onSerialConnect(){

		for( let team of this.teams )
			team.connected = false;
		this.draw();
		

	}
	onSerialRemoteConnect( teamColor, connected = true ){

		const team = this.getTeamByColor(teamColor);
		if( !team )
			return;
		
		team.connected = Boolean(connected);
		if( team.connected )
			team.active = true;
		this.draw();

		this.updateDisplay(team);
		this.updateBuzzer(team);

	}
	async onRemoteButton( teamColor ){
		await this.getState().execRemoteButton(teamColor);
	}
	onRemoteText( teamColor, text ){
		this.getState().execRemoteText(teamColor, text);	
	}


	// Events from UI
	onQuestionClicked( question ){

		if( Game.isEditMode() ){
			
			const category = this.getActiveBoard().getCategoryByQuestionID(question.id);
			Game.ui.showQuestionEditor(category, question);

		}
		else{
			
			let type = Question.Type.Regular;
			if( this.isQuestionDailyDouble(question) )
				type = Question.Type.DailyDouble;
			this.setActiveQuestion(question, type);

		}

	}

	// Cancel question
	onQuestionOverlayBackgroundClicked(){
		this.setState('board');
	}













	/* TEAM MANAGEMENT */
	onTeamScoreChanged( team ){

		this.updateDisplay(team);
		this.draw();

	}


	getTeamByColor( color ){

		color = parseInt(color);
		for( let team of this.teams ){

			if( team.color === color )
				return team;

		}

	}


	getCategoryPickingTeam(){

		return this.getTeamByColor(this.categoryTeam);

	}

	getTeamsThatCanAnswer(){

		let out = [];
		for( let team of this.teams ){
			
			if( team.buzzerEnabled && team.active )
				out.push(team);
			
		}
		return out;

	}

	

	/* BUZZER MANAGEMENT */
	// Updates buzzers on the board. Teams can be a boolean true (all), false (none), or an array of team colors
	updateBuzzers(){
		
		let enabledTeams = this.getTeamsThatCanAnswer();
		if( enabledTeams.length === this.teams.length )
			Game.Serial.taskToggleButton(Constants.BUTTON_COLOR.ALL, true);
		else if( !enabledTeams.length )
			Game.Serial.taskToggleButton(Constants.BUTTON_COLOR.ALL, false);
		else{
			let order = Game.shuffle(this.teams.slice());
			for( let team of order )
				this.updateBuzzer(team);

		}

	}

	updateBuzzer( team ){

		console.log("Updating buzzer", team.color, team.connected, team.buzzerEnabled);
		if( !team.connected )
			return false;
		return Game.Serial.taskToggleButton(team.color, team.buzzerEnabled);

	}

	enableAllBuzzers(){
		this.teams.forEach(team => team.buzzerEnabled = true);
		return this.updateBuzzers();
	}

	disableAllBuzzers(){
		this.teams.forEach(team => team.buzzerEnabled = false);
		return this.updateBuzzers();
	}

	updateDisplays(){
		
		for( let team of this.teams )
			this.updateDisplay(team);

		
	}

	updateDisplay( team ){

		console.log(team, team.displayMode, team.connected);

		if( !team.connected )
			return;

		const dm = team.displayMode;
		
		if( dm === Team.Displaymode.Score || dm === Team.Displaymode.Blank ){
			
			let text = '';
			if( dm === Team.Displaymode.Score )
				text = team.score;
			Game.Serial.taskShowText(team.color, 0, 0xFFFFFF, text);

		}
		else if( dm === Team.Displaymode.Numpad ){

			const maxVal = Math.max(2000, team.score);
			Game.Serial.taskShowNumpad(team.color, 0, 0xFFFFFF, maxVal, "Enter your bet [max "+maxVal+"]:"); // Todo: Configure min bet

		}
		else if( dm === Team.Displaymode.Keyboard ){
			
			Game.Serial.taskShowKeyboard(team.color, 0, 0xFFFFFF, 100, "Your Answer:");

		}

	}

	// Sets all displays to show the current score
	setAllDisplaysScore(){
		this.teams.map(el => el.setDisplayMode(Team.Displaymode.Score));
		this.updateDisplays();
	}

	setAllDisplaysNumpad(){
		this.teams.map(el => el.setDisplayMode(Team.Displaymode.Numpad));
		this.updateDisplays();
	}

	setAllDisplaysKeyboard(){
		this.teams.map(el => el.setDisplayMode(Team.Displaymode.Keyboard));
		this.updateDisplays();
	}

	setDisplayNumpad( team ){
		team.setDisplayMode(Team.Displaymode.Numpad);
		this.updateDisplays();
	}





	// Editing
	// Adds a category to current board
	addCategory( category ){

		try{
			this.getActiveBoard().addCategory(category);
		}catch(e){ console.error(e); return; }
		this.draw(true);
		this.save();

	}

	removeCategory( id ){

		for( let board of this.boards ){
			board.removeCategory(id);
		}
		this.draw();
		this.save();

	}

	getAllCategories(){

		let out = [];
		for( let board of this.boards ){
			for( let category of board.categories ){
				out.push(category);
			}
		}
		return out;

	}

	// Tools
	static shuffle(array){
		for (var i = array.length - 1; i > 0; i--) {
			var j = Math.floor(Math.random() * (i + 1));
			var temp = array[i];
			array[i] = array[j];
			array[j] = temp;
		}
		return array;
	}

	static randElem( array ){
		return array[Math.floor(Math.random() * array.length)];
	}





	/* TEAM MANAGEMENT */
	getAnsweringTeam(){

		if( this.answeringTeam < 0 )
			return false;
		return this.teams[this.answeringTeam];

	}
	setAnsweringTeam( team ){

		if( team === false ){
			this.answeringTeam = -1;
			return;
		}

		this.answeringTeam = team.color;


	}




	/* QUESTION MANAGEMENT */
	getActiveQuestion(){
		
		const board = this.getActiveBoard();
		return board.getQuestionByID(this.activeQuestion);

	}

	// Asks a question
	// Type can either be Question.Type.* or undefined if we shouldn't modify the type
	setActiveQuestion( question, type ){

		if( question === false ){

			this.activeQuestion = '';
			Game.ui.toggleQuestion(false);
			return;

		}

		if( !(question instanceof Question) )
			question = category.getQuestionByID(question);

		if( !question )
			throw new Error("[setActiveQuestion] Invalid question");

		this.activeQuestionType = type;
		this.activeQuestion = question.id;
		this.answeringTeam = -1;

		if( type === Question.Type.DailyDouble ){

			const team = this.getCategoryPickingTeam();
			this.setAnsweringTeam(team);
			this.setState('dailyDouble');

		}
		else{
			this.setState('question');
		}
		
	}

	// Also shows the answer
	setActiveQuestionCompleted(){

		const question = this.getActiveQuestion();
		if( !question )
			return;

		Game.ui.setQuestionTimeLeft(0,0);
		Game.ui.toggleQuestion(question, true);
		this.completedQuestions.add(question.id);
		this.setActiveQuestion(false);
		this.draw();
		this.save();

	}

	getAllQuestionIds(){

		let out = [];
		for( let board of this.boards ){
			for( let category of board.categories ){
				for( let question of category.questions ){
					out.push(question.id);
				}
			}
		}
		return out;

	}

	// used to debug transitions
	setAllQuestionsCompleted(){

		const all = this.getActiveBoard().getAllQuestions();
		for( let q of all )
			this.completedQuestions.add(q.id);

		this.draw();
		this.getState().updateControls();
		this.save();
		
	}

	isActiveQuestionCompleted( id ){

		if( id instanceof Question )
			id = id.id;

		return this.completedQuestions.has(id);

	}
	
	isQuestionDailyDouble( question ){ return this.dailyDoubles.has(question.id); }





	/* CATEGORIES */
	getUnpresentedCategories(){

		let out = [];
		const board = this.getActiveBoard();
		if( !board )
			return out;

		for( let cat of board.categories ){

			if( !this.presentedCategories.has(cat.id) )
				out.push(cat);

		}
		return out;

	}

	getCategoryByID( id ){
		return this.getActiveBoard().getCategoryByID(id);
	}

	getCategoryByIDAnyBoard( id ){

		for( let board of this.boards ){
			const cat = board.getCategoryByID(id);
			if( cat )
				return cat;
		}

	}








	/* BOARDS */
	getActiveBoard(){
		return this.boards[this.activeBoard];
	}
	activeBoardHasUnAnsweredQuestions(){

		const questions = this.getActiveBoard().getAllQuestions();
		for( let q of questions ){
			if( !this.completedQuestions.has(q.id) )
				return true;
		}
		return false;

	}


}


