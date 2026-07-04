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
	static State = {
		Idle : "Idle",
		Question : "Question",	
	};
	static Stage = {
		Board : "Board",
		DailyDouble : "DailyDouble",
		Final : "Final",
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
	state = Game.State.Idle;
	dailyDoubles = new Set();			// Question IDs
	completedQuestions = new Set();		// Question IDs
	nrDailyDoubles = 1;					// Per board

	activeBoard = 0;
	activeCategory = '';				// ID
	activeQuestion = 0;
	stage = Game.Stage.Board;

	#saveTimer = null;

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
			state : this.state,
			dailyDoubles : Array.from(this.dailyDoubles),
			completedQuestions : Array.from(this.completedQuestions),
			activeBoard : this.activeBoard,
			activeCategory : this.activeCategory,
			activeQuestion : this.activeQuestion,
			teams : Team.dumpThese(this.teams),
			stage : this.stage,
			nrDailyDoubles : this.nrDailyDoubles,
		};

		return out;

	}

	draw( recache ){
		this.constructor.draw(recache);
	}

	async onLoaded(){
		
		this.boards = Board.loadThese(this.boards);
		this.teams = Team.loadThese(this.teams);
		this.finalQuestion = new Question(this.finalQuestion);
		this.dailyDoubles = new Set(this.dailyDoubles);
		this.completedQuestions = new Set(this.completedQuestions);
		const promises = this.boards.map(b => b.loadCategories());
		await Promise.all(promises);
		this.draw(true);

	}

	isStarted(){
		return this.teams.some(team => team.score !== 0) || this.completedQuestions.size > 0;
	}

	resetIfNotStarted(){
		if( !this.isStarted() )
			this.reset();
	}

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

	}
	onRemoteButton( teamColor ){

		const team = this.getTeamByColor(teamColor);
		if( !teamColor )
			return;

		console.log("Got button press from", team);

	}
	onRemoteText( teamColor, text ){

		const team = this.getTeamByColor(teamColor);
		if( !teamColor )
			return;

		console.log("Got text", text, "from", team);

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
		this.activeCategory = 0;
		this.activeQuestion = 0;

		this.dailyDoubles = new Set();
		this.completedQuestions = new Set();
		for( let team of this.teams )
			team.reset();

		if( this.nrDailyDoubles > 0 ){

			const viableDailyDoubles = this.getAllQuestionIds();
			Game.shuffle(viableDailyDoubles);
			this.dailyDoubles = new Set(viableDailyDoubles.slice(0, this.nrDailyDoubles));
			
		}

		this.draw(true);

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
		return this.boards[this.activeBoard].categories[this.activeCategory].questions[this.activeQuestion];
	}

	isQuestionCompleted( id ){
		return this.completedQuestions.has(id);
	}


	

	advanceBoard(){

		++this.activeBoard;
		this.activeBoard = this.activeBoard % this.boards.length;
		this.draw(true);
		this.save();

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
	}


}


