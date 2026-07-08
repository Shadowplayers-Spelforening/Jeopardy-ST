import Autoloader from "./_Autoloader.js";
import Board from "./Board.js";
import Constants from "./Constants.js";
import Question from "./Question.js";
import Serial from "./Serial.js";
import Team from "./Team.js";
import Dexie from '../lib/dexie.min.js';
import Category from "./Category.js";
import UI from "./UI.js";

export default class Game extends Autoloader{

	static Serial = new Serial();
	static Stage = {
		Board : "Board",
		Question : "Question",
		DailyDouble : "DailyDouble",		// waiting for a player to bet
		Final : "Final",
		DailyDoubleCompleted : "DailyDoubleCompleted",		// Currently showing answer, waiting for enter to show what the wager was and modify score
		ShowWager : "ShowWager"				// Show wager for active team
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

	// Game data
	id = crypto.randomUUID();
	dailyDoubles = new Set();			// Question IDs
	completedQuestions = new Set();		// Question IDs
	nrDailyDoubles = 1;					// Per board
	answerTime = 6;						// Seconds to answer
	questionTime = 30;					// Seconds per question to answer
	activeBoard = 0;
	stage = Game.Stage.Board;
	categoryTeam = 0;					// Team that's picking category. This is updated on question correct.
	minWager = 2000;					// Minimum max wager you can pick on finale or daily double
	
	#saveTimer = null;

	#activeQuestion = '';				// ID

	#answerTicks = 0;					// Seconds left for the team that buzzed in to answer
	#questionTicks = 0;					// Seconds left for a team to buzz in
	#answerInterval = null;				// Starts when a question is presented
	#answeringTeam = -1;				// Team that buzzed in (-1 = none) Use getAnsweringTeam()
	#questionType = Question.Type.Regular;
	#activateBuzzersTimeout = null;		// Time before activating buzzers
	#lastAnswerCorrect = false;			// Used for wagering

	teams = [
		new Team({color:Constants.BUTTON_COLOR.RED}),
		new Team({color:Constants.BUTTON_COLOR.YELLOW}),
		new Team({color:Constants.BUTTON_COLOR.GREEN}),
		new Team({color:Constants.BUTTON_COLOR.BLUE}),
		new Team({color:Constants.BUTTON_COLOR.WHITE})
	];
	

	constructor( data ){
		super(data);
		this.autoLoad(data);
	}

	dump(){

		let out = {
			id : this.id,
			name : this.name,
			boards : Board.dumpThese(this.boards),
			finalQuestion : this.finalQuestion.dump(),
			id : this.id,
			dailyDoubles : Array.from(this.dailyDoubles),
			completedQuestions : Array.from(this.completedQuestions),
			activeBoard : this.activeBoard,
			teams : Team.dumpThese(this.teams),
			nrDailyDoubles : this.nrDailyDoubles,
			categoryTeam : this.categoryTeam,
		};

		return out;

	}

	draw( recache ){
		this.constructor.draw(recache);
	}

	async onLoaded(){
		
		this.boards = Board.loadThese(this.boards);
		this.teams = Team.loadThese(this.teams);
		this.teams.map(team => team.setDisplayMode(Team.Displaymode.Score));
		this.finalQuestion = new Question(this.finalQuestion);
		this.dailyDoubles = new Set(this.dailyDoubles);
		this.completedQuestions = new Set(this.completedQuestions);
		const promises = this.boards.map(b => b.loadCategories());
		await Promise.all(promises);
		this.draw(true);
		this.setStage(this.stage, true);

	}

	isStarted(){
		return this.teams.some(team => team.score !== 0) || this.completedQuestions.size > 0;
	}

	resetIfNotStarted(){
		if( !this.isStarted() )
			this.reset();
	}


	async setStage( stage, force = false ){

		if( stage === this.stage && !force )
			return;

		this.stage = stage;
		if( stage === Game.Stage.Board ){

			this.disableAllBuzzers().catch(e => {if( !force ){console.error(e);}});
			this.setActiveQuestion(false);
			
		}
		else if( stage === Game.Stage.DailyDouble ){

			await this.disableAllBuzzers();
			const team = this.getAnsweringTeam();
			const question = this.getActiveQuestion();
			Game.ui.toggleQuestion(new Question({
				id : question.id,
				question : "Daily Double!"
			}));
			Game.ui.toggleQuestionActive(team);
			team.setDisplayMode(Team.Displaymode.Numpad);
			await this.updateDisplays();

		}
		else if( stage === Game.Stage.ShowWager ){

			const team = this.getCategoryPickingTeam();
			let num = parseInt(team.lastNumber) || 0;
			const question = new Question({
				question : String(num),
			});
			
			// Draw the wager as a question
			Game.ui.toggleQuestion(question);
			Game.ui.toggleQuestionActive(team);
			
			if( !this.#lastAnswerCorrect )
				num = -num;
			team.score += num;
			this.onTeamScoreChanged(team);
			this.save();

		}
		else if( stage === Game.Stage.DailyDoubleCompleted ){

		}

		this.updateControls();

	}


	// return true if we captured it
	async onKeyPress( key ){

		if( this.stage === Game.Stage.Question ){
			
			// Question has been answered
			if( !this.#activeQuestion ){

				if( key === 'Enter' )
					this.setStage(Game.Stage.Board); // Emulate clicking outside of overlay

			}
			else if( key === 'Enter' ){
				this.stopAnswerInterval();
				this.onAnswerCorrect();
				return true;
			}
			else if( key === 'Backspace' ){
				this.stopAnswerInterval();
				this.onAnswerIncorrect();
				return true;
			}

		}
		else if( this.stage === Game.Stage.DailyDouble ){
			
			const team = this.getAnsweringTeam();
			if( key === 'Enter' && !team.buzzerEnabled ){ // buzzerEnabled is set to false when they send in their bet
				
				const question = this.getActiveQuestion();
				await this.setActiveQuestion(question, Question.Type.Regular);

			}

		}
		else if( this.stage === Game.Stage.DailyDoubleCompleted ){

			if( key === 'Enter' )
				this.setStage(Game.Stage.ShowWager);

		}
		else if( this.stage === Game.Stage.ShowWager ){

			await this.setStage(Game.Stage.Board);
			this.draw();

		}

		
		return false;
	}


	// Events from serial device
	onSerialConnect(){

		for( let team of this.teams )
			team.connected = false;
		this.draw();
		

	}
	async onSerialRemoteConnect( teamColor, connected = true ){

		const team = this.getTeamByColor(teamColor);
		if( !team )
			return;
		
		team.connected = Boolean(connected);
		if( team.connected )
			team.active = true;
		this.draw();

		await this.updateDisplay(team);
		await this.updateBuzzer(team);

	}
	onRemoteButton( teamColor ){

		const team = this.getTeamByColor(teamColor);
		if( !teamColor )
			return;

		if( this.stage === Game.Stage.Question ){

			if( !this.getAnsweringTeam() ){
				this.disableAllBuzzers();
				this.setAnsweringTeam(team);
			}

		}
		

	}
	async onRemoteText( teamColor, text ){

		const team = this.getTeamByColor(teamColor);
		if( !team )
			return;

		if( this.stage === Game.Stage.DailyDouble ){

			const amount = parseInt(text) || 0;
			if( 
				this.getAnsweringTeam() === team &&
				team.buzzerEnabled &&
				amount > 0 &&
				(amount <= this.minWager || amount <= this.getAnsweringTeam().score)
			){

				team.buzzerEnabled = false;
				team.lastNumber = amount;
				team.setDisplayMode(Team.Displaymode.Score);
				await this.updateDisplay(team);
				await this.updateBuzzer(team);
				this.updateControls();

			}


		}
		

	}


	// Events from UI
	onQuestionClicked( question ){

		if( Game.isEditMode() )
			Game.ui.showQuestionEditor(question);
		else{
			
			let type = Question.Type.Regular;
			if( this.isQuestionDailyDouble(question) )
				type = Question.Type.DailyDouble;
			this.setActiveQuestion(question, type);

		}

	}

	// Cancel question
	onQuestionOverlayBackgroundClicked(){
		this.stopAnswerInterval();
		this.setStage(Game.Stage.Board);
	}

	// Time for buzzing in has ended
	onQuestionTimedOut(){

		this.stopAnswerInterval();
		this.setActiveQuestionCompleted();

	}

	// Time for the active team to answer has ended
	// Host has to decide whether they answered correct or not
	onAnswerTimedOut(){

		this.stopAnswerInterval();
		console.log("Player answer timed out. Still have to wait for judge tho.");

	}

	onAnswerCorrect(){
		
		this.stopAnswerInterval();
		const question = this.getActiveQuestion();
		const team = this.getAnsweringTeam();
		if( !question || !team )
			return;

		this.#lastAnswerCorrect = true;
		

		this.setActiveQuestionCompleted();

		if( this.isActiveQuestionDailyDouble() ){

			
			this.setStage(Game.Stage.DailyDoubleCompleted);

		}
		else{
			
			team.score += question._value;
			this.onTeamScoreChanged(team);

		}

		this.categoryTeam = team.color;
		Game.ui.toggleQuestionActive(team);	// Colorizes the answer so we know who got the right answer
		this.updateControls();

	}

	onAnswerIncorrect(){
		
		const question = this.getActiveQuestion();
		const team = this.getAnsweringTeam();
		if( !question || !team )
			return;

		team.buzzerEnabled = false;
		this.#lastAnswerCorrect = false;
		

		if( this.isActiveQuestionDailyDouble() ){

			this.onQuestionTimedOut();		// Shows the answer
			Game.ui.toggleQuestionActive(team);	// Colorizes the answer so we know who got the right answer
			this.setStage(Game.Stage.DailyDoubleCompleted);

		}
		else{

			team.score -= question._value;
			this.onTeamScoreChanged(team);
			this.setAnsweringTeam(false);
			// There are teams left
			const remainingTeams = this.getTeamsThatCanAnswer();
			if( remainingTeams.length ){

				this.startAnswerInterval();
				Game.ui.toggleQuestionActive(false);
				this.updateBuzzers();

			}
			// No teams left
			else{
				this.onQuestionTimedOut();
			}

		}
		this.updateControls();

	}

	onTeamScoreChanged( team ){

		this.updateDisplay(team);
		this.draw();

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

	onDeactivate(){
		clearTimeout(this.#saveTimer);
		clearInterval(this.#answerInterval);
		clearTimeout(this.#activateBuzzersTimeout);
	}

	getTeamByColor( color ){

		color = parseInt(color);
		for( let team of this.teams ){

			if( team.color === color )
				return team;

		}

	}

	recache(){
		
		for( let b = 0; b < this.boards.length; ++b ){
			
			this.boards[b].recache(b);
			
		}

		Game.draw();

	}

	reset(){

		this.activeBoard = 0;
		this.#activeQuestion = '';

		this.categoryTeam = 0;
		this.dailyDoubles = new Set();
		this.completedQuestions = new Set();
		const viableStartTeams = [];
		for( let team of this.teams ){

			team.reset();
			team.setDisplayMode(Team.Displaymode.Score);
			if( team.active )
				viableStartTeams.push(team.color);

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

	save(){
		clearTimeout(this.#saveTimer);
		this.#saveTimer = setTimeout(() => Game.saveGame(this), 500);
	}
	
	getCategoryPickingTeam(){

		return this.getTeamByColor(this.categoryTeam);

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

	getActiveBoard(){
		return this.boards[this.activeBoard];
	}

	getActiveQuestion(){
		
		const board = this.getActiveBoard();
		return board.getQuestionByID(this.#activeQuestion);

	}

	// Starts the timer. Doesn't reset ticks. Useful because the question timer pauses when a team buzzes in
	startAnswerInterval(){
		
		this.stopAnswerInterval();
		if( !this.#answerTicks && !this.#questionTicks )
			return;

		this.#answerInterval = setInterval(() => {
			
			const answeringTeam = this.getAnsweringTeam();
			if( answeringTeam ){

				if( !(--this.#answerTicks) ){
					this.onAnswerTimedOut();
				}
				Game.ui.setQuestionTimeLeft(this.#answerTicks, this.getAnswerTime());

			}
			else if( !this.isActiveQuestionDailyDouble() ){
				if( !(--this.#questionTicks) ){
					this.onQuestionTimedOut();
				}
			}
			

		}, 1000);

	}

	stopAnswerInterval(){

		clearInterval(this.#answerInterval);
	}

	// Asks a question
	// Type can either be Question.Type.* or undefined if we shouldn't modify the type
	async setActiveQuestion( question, type ){

		if( question === false ){
			this.#activeQuestion = '';
			Game.ui.toggleQuestion(false);
			this.updateControls();
			return;
		}

		if( !(question instanceof Question) )
			question = category.getQuestionByID(question);

		if( !question )
			throw new Error("[setActiveQuestion] Invalid question");

	

		this.#activeQuestion = question.id;
		this.#answeringTeam = -1;
		this.#questionTicks = this.questionTime;

		const isDailyDouble = this.isActiveQuestionDailyDouble();

		clearTimeout(this.#activateBuzzersTimeout);

		// This is set when encountering the daily double
		if( type === Question.Type.DailyDouble ){

			const team = this.getCategoryPickingTeam();
			await this.setAnsweringTeam(team);
			await this.setStage(Game.Stage.DailyDouble);
			team.buzzerEnabled = true;		// Allows team to answer

		}
		// This is also called on a daily double, once the team has made a bet
		else{
			
			await this.setStage(Game.Stage.Question);
			Game.ui.toggleQuestion(question);
			await this.updateControls();

			if( isDailyDouble ){
				const team = this.getCategoryPickingTeam();
				await this.setAnsweringTeam(team);
			}
			else{
				this.#activateBuzzersTimeout = setTimeout(() => {
					this.enableAllBuzzers();
				}, 1000);
			}
			
			this.startAnswerInterval();


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

	isActiveQuestionCompleted( id ){

		if( id instanceof Question )
			id = id.id;

		return this.completedQuestions.has(id);
	}
	
	isActiveQuestionFinale(){ return false; }	// Todo
	isActiveQuestionDailyDouble(){ 
		const question = this.getActiveQuestion();
		return question && this.isQuestionDailyDouble(question); 
	}
	isQuestionDailyDouble( question ){ return this.dailyDoubles.has(question.id); }

	getAnsweringTeam(){

		if( this.#answeringTeam < 0 )
			return false;
		return this.teams[this.#answeringTeam];

	}
	setAnsweringTeam( team ){

		if( team === false ){
			this.#answeringTeam = -1;
			return;
		}

		this.#answeringTeam = team.color;

		if( this.stage === Game.Stage.DailyDouble )
			return;

		Game.ui.toggleQuestionActive(team);
		const aTime = this.getAnswerTime();
		this.#answerTicks = aTime;
		Game.ui.setQuestionTimeLeft(aTime, aTime);
		this.updateControls();

	}

	// Gets total time a team that has buzzed in (or finale, or daily double) has to answer
	getAnswerTime(){
		return this.isActiveQuestionDailyDouble() ? 30 : this.answerTime;
	}
	
	getTeamsThatCanAnswer(){

		let out = [];
		for( let team of this.teams ){
			
			if( team.buzzerEnabled && team.active )
				out.push(team);
			
		}
		return out;

	}

	advanceBoard(){

		++this.activeBoard;
		this.activeBoard = this.activeBoard % this.boards.length;
		this.draw(true);
		this.save();

	}

	



	// Updates buzzers on the board. Teams can be a boolean true (all), false (none), or an array of team colors
	async updateBuzzers(){
		
		let enabledTeams = this.getTeamsThatCanAnswer();
		if( enabledTeams.length === this.teams.length )
			await Game.Serial.taskToggleButton(Constants.BUTTON_COLOR.ALL, true);
		else if( !enabledTeams.length )
			await Game.Serial.taskToggleButton(Constants.BUTTON_COLOR.ALL, false);
		else{
			let order = Game.shuffle(this.teams.slice());
			for( let team of order )
				await this.updateBuzzer(team);

		}

	}

	async updateBuzzer( team ){
		if( !team.connected )
			return false;
		await Game.Serial.taskToggleButton(team.color, team.buzzerEnabled);	
	}

	async enableAllBuzzers(){
		this.teams.forEach(team => team.buzzerEnabled = true);
		return this.updateBuzzers();
	}

	async disableAllBuzzers(){
		this.teams.forEach(team => team.buzzerEnabled = false);
		return this.updateBuzzers();
	}

	async updateDisplays(){
		
		for( let team of this.teams )
			await this.updateDisplay(team);

		
	}

	async updateDisplay( team ){

		if( !team.connected )
			return;

		const dm = team.displayMode;
		if( dm === Team.Displaymode.Score || dm === Team.Displaymode.Blank ){
			
			let text = '';
			if( dm === Team.Displaymode.Score )
				text = team.score;
			await Game.Serial.taskShowText(team.color, 0, 0xFFFFFF, text);

		}
		else if( dm === Team.Displaymode.Numpad ){

			const maxVal = Math.max(2000, team.score);
			await Game.Serial.taskShowNumpad(team.color, 0, 0xFFFFFF, maxVal, "Enter your bet [max "+maxVal+"]:"); // Todo: Configure min bet

		}
		else if( dm === Team.Displaymode.Keyboard ){
			
			await Game.Serial.taskShowKeyboard(team.color, 0, 0xFFFFFF, 100, "Your Answer:");

		}

	}

	// Sets all displays to show the current score
	async setAllDisplaysScore(){
		this.teams.map(el => el.setDisplayMode(Team.Displaymode.Score));
		await this.updateDisplays();
	}

	async setAllDisplaysNumpad(){
		this.teams.map(el => el.setDisplayMode(Team.Displaymode.Numpad));
		await this.updateDisplays();
	}

	async setAllDisplaysKeyboard(){
		this.teams.map(el => el.setDisplayMode(Team.Displaymode.Keyboard));
		await this.updateDisplays();
	}

	async setDisplayNumpad( team ){
		team.setDisplayMode(Team.Displaymode.Numpad);
		await this.updateDisplays();
	}



	// Updates the controls display
	updateControls(){

		let controls = [];
		if( this.stage === Game.Stage.Question ){

			if( !this.getActiveQuestion() ){
				controls.push(
					'Enter: Continue',
				);
			}
			else if( this.getAnsweringTeam() ){
				controls.push(
					'Bck: Wrong',
					'Enter: Correct',
				);
			}

		}
		else if( this.stage === Game.Stage.DailyDouble ){
			
			const team = this.getAnsweringTeam();
			if( team && !team.buzzerEnabled ){ // buzzerEnabled is set to false when they send in their bet
				controls.push(
					'Enter: Show Question'
				);
			}

		}
		else if( this.stage === Game.Stage.ShowWager ){
			controls.push('Enter: Continue');
		}
		else if( this.stage === Game.Stage.DailyDoubleCompleted ){
			controls.push('Enter: Show Wager');
		}
		Game.ui.setControls(...controls);

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


}


