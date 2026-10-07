import Category from "./Category.js";
import Constants from "./Constants.js";
import Game from "./Game.js";
import Question from "./Question.js";
import Team from "./Team.js";

export default class UI{

	game = null;		// Game
	wrap = document.getElementById('wrap');
	title = document.getElementById('title');
	gameState = document.getElementById('gameState');
	board = document.getElementById('board');
	teams = document.getElementById('teams');
	menu = document.getElementById('menu');
	boardName = document.getElementById('boardName');
	categories = document.getElementById('categories');
	question = document.getElementById('question');
	questionContent = document.getElementById('questionContent');
	questionText = document.getElementById('questionText');
	questionTeam = document.getElementById('questionTeam');
	questionTimer = document.getElementById('questionTimer');
	modal = document.getElementById('modal');
	modalContent = document.getElementById('modalContent');
	status = document.getElementById('status');
	controls = document.querySelector('#controls > ul');

	constructor(){

		this.menu.querySelectorAll('.button').forEach(b => b.addEventListener('click', (event) => {
			this.onMenuClick(event.currentTarget.dataset.id);
		}));
		this.modal.addEventListener('mousedown', () => this.modal.classList.toggle('hidden', true));
		this.modalContent.addEventListener('mousedown', (event) => event.stopPropagation());

		this.title.addEventListener('input', () => {
			this.game.name = this.title.innerText.trim();
			this.game.save();
		});

		this.question.addEventListener('click', () => {
			this.game.onQuestionOverlayBackgroundClicked();
		});

		this.questionContent.addEventListener('click', event => {
			event.stopImmediatePropagation();

		});

		window.addEventListener('keydown', (event) => {
			if( this.game.onKeyPress(event.key) ){
				event.preventDefault();
			}
		});

	}

	setGame( game ){
		console.log("UI game is now", game);
		this.game = game;
		//this.showCategoryBrowser();
	}

	onMenuClick( label ){

		this.menu.classList.toggle('off', true);
		setTimeout(() => this.menu.classList.toggle('off', false), 100);
		if( label === 'resetGame' )
			this.game.reset();
		else if( label === 'connectHub' )
			Game.Serial.connect();
		else if( label === 'enableEdit' )
			Game.toggleEditMode(true);
		else if( label === 'disableEdit' )
			Game.toggleEditMode(false);
		else if( label === 'categoryBrowser' )
			this.showCategoryBrowser();
		else if( label === 'gameBrowser' )
			this.showGameBrowser();
		else if( label === 'switchBoard' )
			this.game.advanceBoard();
		else if( label === 'editFinalQuestion' )
			this.showQuestionEditor( this.game, this.game.finalQuestion, this.game.finalQuestionCategory );

	}

	draw(){

		const isEditMode = Game.isEditMode();
		this.title.classList.toggle('hidden', !this.game);
		this.board.classList.toggle('hidden', !this.game);
		this.teams.classList.toggle('hidden', !this.game);
		this.wrap.classList.toggle('editMode', isEditMode);
		if( !this.game ){
			return;
		}

		this.renderTitle();
		this.renderTeams();
		this.renderBoard();
		this.renderStatus();

	}

	renderTitle(){

		this.title.innerText = this.game.name;

		let stateName = 'Round '+(this.game.activeBoard+1);
		if( this.game.stage === Game.Stage.DailyDouble )
			stateName = 'Daily Double!';
		if( this.game.stage === Game.Stage.Final )
			stateName = 'Final Round!';

		this.gameState.innerText = stateName;


	}

	renderTeams(){

		const game = this.game;
		let numConnected = 0;

		let pickingTeam = game.getCategoryPickingTeam();
		if( game.stage !== Game.Stage.Board )
			pickingTeam = null;

		const teams = this.teams.childNodes;
		for( let i = 0; i < this.game.teams.length; ++i ){

			const team = this.game.teams[i];
			numConnected += team.isConnected();

			if( !teams[i] ){

				const div = document.createElement('div')
				div.classList.add('team');
				div.classList.add(team.getColorLabel());
				this.teams.append(div);
				const teamName = document.createElement('div');
				teamName.contentEditable = true;
				teamName.classList.add('name');
				teamName.addEventListener('input', () => {
					team.name = teamName.innerText.trim();
					game.save();
				});
				div.append(teamName);
				const teamScore = document.createElement('div');
				teamScore.contentEditable = true;
				teamScore.classList.add('score');
				div.append(teamScore);

			}

			const div = teams[i];

			const teamName = div.childNodes[0];
			teamName.innerText = team.getName();
			const teamScore = div.childNodes[1];
			teamScore.innerText = team.getScore();
			teamScore.addEventListener('input', () => {

				clearTimeout(teamScore._save);
				let score = parseInt(teamScore.innerText.trim());
				if( isNaN(score) )
					return;
				team.score = score;
				game.save();

			});
			div.classList.toggle('active', team === pickingTeam);

			div.classList.toggle('hidden', !team.isConnected());

		}

		// set grid-template-columns: repeat(5, 1fr);
		this.teams.style.gridTemplateColumns = `repeat(${numConnected}, 1fr)`;

	}

	renderCategory( colDiv, category ){

		const game = this.game;
		const questions = category.questions;
		const editMode = Game.isEditMode();
		
		colDiv.childNodes.forEach((q) => {
			q.classList.toggle('hidden', true);
			delete q.dataset.id;
		});
		let titleSpan;

		// Create title
		if( !colDiv.childNodes.length ){

			const div = document.createElement('div');
			div.classList.add('title');
			colDiv.append(div);

			const span = document.createElement('span');
			div.append(span);
			span.contentEditable = editMode;
			span._resize = () => {

				const vmin = Math.min(window.innerWidth, window.innerHeight);
				const size = span.getBoundingClientRect().height;

				const targetPerc = 0.13;	// Tied to #categories > div.category > div - Equal to 100th of vmin
				const defaultFontSize = 2.5;	// Tied to body font size
				const perc = targetPerc / Math.max(targetPerc, size / vmin);
				const newSize = defaultFontSize * perc;
				span.style.fontSize = `${newSize}vmin`;

			};
			span.oninput = () => {

				clearTimeout(span._save);
				span._save = setTimeout(() => {
					category.name = span.innerText.trim() || '???';
					Game.dbSaveCategory(category);
					span._resize();
				}, 500);

			};
			titleSpan = span;

		}
		colDiv.childNodes[0].childNodes[0].innerText = this.game.presentedCategories.has(category.id) || editMode ? category.name : '???';
		colDiv.childNodes[0].classList.toggle('hidden', false);

		for( let i = 0; i < questions.length; ++i ){

			
			const question = questions[i];
			let div = colDiv.childNodes[i+1];
			if( !div ){

				div = document.createElement('div');
				div.classList.add('question');
				colDiv.append(div);

				const value = document.createElement('span');
				value.classList.add('value');
				div.append(value);

			}

			div.childNodes[0].innerText = question._value;

			div.classList.remove("valid");
			div.classList.remove("answered");

			if( editMode ){
				div.classList.toggle("valid", question.isValid());
			}
			else{
				const completed = game.isActiveQuestionCompleted(question);
				div.classList.toggle("answered", completed);
				if( completed && game.isQuestionDailyDouble(question) )
					div.childNodes[0].innerText = 'DD';
			}
			div.classList.toggle("hidden", false);
			div.dataset.id = question.id;

			div.onclick = event => {
				game.onQuestionClicked(question);
			};
			

		}

		if( titleSpan ){
			setTimeout(() => {
				titleSpan._resize();
			}, 10);
		}

	}

	renderBoard(){

		const game = this.game;
		const board = game.getActiveBoard();
		let categories = board.categories;
		this.categories.childNodes.forEach((c) => c.classList.toggle('hidden', true));
		for( let i = 0; i < categories.length; ++i ){
			
			const cat = categories[i];
			let div = this.categories.childNodes[i];
			if( !div ){

				div = document.createElement('div');
				div.classList.add('category');
				this.categories.append(div);

			}

			if( cat instanceof Category )
				this.renderCategory(div, cat);
			div.classList.toggle('hidden', !cat);

		}


	}

	renderStatus(){
		
		const game = this.game;
		const notices = [];
		
		if( !game.hasFinalQuestion() )
			notices.push('Final question is invalid.');

		let boardSizeUneven = false;
		for( let i = 0; i < game.boards.length; ++i ){
			
			if( game.boards[i].isEmpty() )
				notices.push(`Board ${i+1} is empty.`);
			else if( game.boards[i].hasInvalidQuestion() )
				notices.push(`Board ${i+1} has invalid questions.`);
			
			if( game.boards[0].categories.length !== game.boards[i].categories.length )
				boardSizeUneven = true;

		}

		if( boardSizeUneven )
			notices.push('Board size is uneven.');


		const ul = document.createElement('ul');
		for( let notice of notices ){
			const li = document.createElement('li');
			li.innerText = notice;
			ul.append(li);
		}

		this.status.replaceChildren(ul);
		
	}

	// Static modals
	toggleModal( on ){

		this.modal.classList.toggle('hidden', !on);

	}

	async showGameBrowser(){

		const game = this.game;
		let elements = [];

		// Edit active game
		let form = document.createElement('form');
		elements.push(form);
		let text = document.createElement('span');
		text.innerText = 'Name: ';
		form.append(text);
		let gameName = document.createElement('input');
		gameName.type = 'text';
		gameName.name = 'name';
		gameName.value = game.name;
		gameName.autocomplete = 'off';
		form.append(gameName);

		gameName.addEventListener('input', () => {
			game.name = gameName.value;
			game.save();
			clearTimeout(gameName._save);
			gameName._save = setTimeout(() => game.draw(true), 500);
		});

		let br = document.createElement('br');
		form.append(br);

		text = document.createElement('span');
		text.innerText = 'Daily Doubles Per Board: ';
		form.append(text);
		let numDailyDoubles = document.createElement('input');
		numDailyDoubles.type = 'number';
		numDailyDoubles.name = 'nrDailyDoubles';
		numDailyDoubles.value = game.nrDailyDoubles;
		numDailyDoubles.min = 0;
		numDailyDoubles.step = 1;
		form.append(numDailyDoubles);

		numDailyDoubles.addEventListener('input', () => {
			game.nrDailyDoubles = parseInt(numDailyDoubles.value) || 0;
			game.resetIfNotStarted();
			game.save();
		});
		
		let hr = document.createElement('hr');
		elements.push(hr);






		// New Game
		let newForm = document.createElement('form');
		elements.push(newForm);
		let newInput = document.createElement('input');
		newInput.type = 'text';
		newInput.name = 'name';
		newInput.required = true;
		newInput.autocomplete = 'off';
		newForm.append(newInput);

		let newButton = document.createElement('input');
		newButton.type = 'submit';
		newButton.value = 'New Game';
		newForm.append(newButton);

		newForm.addEventListener('submit', async (event) => {
			event.preventDefault();

			const name = newInput.value.trim();
			if( !name )
				return;
			await Game.newGame(name);
			this.toggleModal(false);

		});

		



		


		// Import
		let importForm = document.createElement('form');
		elements.push(importForm);

		let importInput = document.createElement('input');
		importInput.type = 'file';
		importInput.accept = '.json';
		importInput.multiple = false;
		importForm.append(importInput);


		importInput.addEventListener('change', async (event) => {
			event.preventDefault();
			
			const file = Array.from(event.target.files)[0];

			let data;
			try{
				const text = await file.text();
				data = JSON.parse(text);
			}catch(error){
				console.error(`Invalid JSON in ${file.name}:`, error.message);
				return;
			}

			if( !Array.isArray(data.categories) || typeof data.game !== "object" ){
				console.error("Invalid data received in file", file.name);
				return;
			}

			const categories = data.categories.map(cat => {
				return Game.dbSaveCategory(new Category(cat))
			});
			await Promise.all(categories);

			const game = new Game(data.game);
			await Game.saveGame(game);
			this.toggleModal(false);
			await Game.loadGame(game.id);
	
		});


		hr = document.createElement('hr');
		elements.push(hr);

		// Listing
		let listing = document.createElement('table');
		listing.classList.add('listing');
		elements.push(listing);

		let tr = document.createElement('tr');
		listing.append(tr);
		let th = document.createElement('th');
		th.innerText = 'Name';
		tr.append(th);
		th = document.createElement('th');
		tr.append(th);

		const games = await Game.dbGetAllGames();
		for( let game of games ){

			let tr = document.createElement('tr');
			tr.dataset.id = game.id;
			tr.classList.add('category');
			if( game.id === Game.game.id )
				tr.classList.add('active');
			listing.append(tr);

			let td = document.createElement('td');
			td.innerText = game.name;
			td.classList.add('name');
			td.addEventListener('click', (event) => {
				Game.loadGame(game.id);
			});
			tr.append(td);

			td = document.createElement('td');

			if( games.length > 1 ){

				let del = document.createElement('input');
				del.type = 'button';
				del.value = 'Delete';
				del.addEventListener('click', async (event) => {
					if( confirm('Do you really want to delete this game?') ){

						Game.dbDeleteGame(game.id);
						if( Game.game.id === game.id ){
							let games = await Game.dbGetAllGames();
							await Game.loadGame(games[0].id);
						}
						this.showGameBrowser();

					}
				});
				td.append(del);

			}

			let ex = document.createElement('input');
			ex.type = 'button';
			ex.value = 'Export (w.Cat)';
			ex.addEventListener('click', (event) => {
				
				const out = {
					game : game.dump(),
					categories : game.getAllCategories()
				};
				const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				let name = game.name.replace(/[^A-Z0-9]/ig, "_");
				a.download = 'JeopardyGame_'+name+'.json';
				a.click();
				URL.revokeObjectURL(url);

			});
			td.append(ex);

			tr.append(td);

		}


		this.modalContent.replaceChildren(...elements);
		this.toggleModal(true);

	}

	async showCategoryBrowser(){

		const game = this.game;
		let elements = [];

		// New category
		let form = document.createElement('form');
		elements.push(form);
		let input = document.createElement('input');
		input.type = 'text';
		input.name = 'name';
		input.required = true;
		input.autocomplete = 'off';
		form.append(input);

		let button = document.createElement('input');
		button.type = 'submit';
		button.value = 'New Category';
		form.append(button);

		form.addEventListener('submit', async (event) => {

			event.preventDefault();
			const name = input.value.trim();
			if( !name )
				return;
			await Game.dbCreateCategory(name);
			
		});


		// Import
		let importForm = document.createElement('form');
		elements.push(importForm);

		let importInput = document.createElement('input');
		importInput.type = 'file';
		importInput.accept = '.json';
		importInput.multiple = true;
		importForm.append(importInput);

		importInput.addEventListener('change', async (event) => {
			event.preventDefault();
			
			const files = Array.from(event.target.files);

			for( const file of files ){

				let data;
				try{
					const text = await file.text();
					data = JSON.parse(text);
				}catch(error){
					console.error(`Invalid JSON in ${file.name}:`, error.message);
					continue;
				}

				if( !data.name || !data.id || !Array.isArray(data.questions) ){
					console.error("Invalid data received in file", file.name);
					continue;
				}

				const category = new Category(data);
				await Game.dbSaveCategory(category);
				game.addCategory(category);

			}

			event.target.files = null;
			this.showCategoryBrowser();
					
		});


		// Listing
		let listing = document.createElement('table');
		listing.classList.add('listing');
		elements.push(listing);

		let tr = document.createElement('tr');
		listing.append(tr);
		let th = document.createElement('th');
		th.innerText = 'Name';
		tr.append(th);
		th = document.createElement('th');
		th.innerText = 'Nr Questions';
		tr.append(th);
		th = document.createElement('th');
		tr.append(th);

		const categories = await Game.dbGetAllCategories();
		for( let category of categories ){

			let tr = document.createElement('tr');
			const active = game.getCategoryByIDAnyBoard(category.id);
			if( active )
				tr.classList.add('active');
			tr.dataset.id = category.id;
			tr.classList.add('category');
			listing.append(tr);
			let td = document.createElement('td');
			td.innerText = category.name;
			td.classList.add('name');
			td.addEventListener('click', (event) => {
				if( !active )
					game.addCategory(category)
				else
					game.removeCategory(category.id);
				this.showCategoryBrowser();
			});
			tr.append(td);
			td = document.createElement('td');
			td.innerText = category.questions.length;
			tr.append(td);
			td = document.createElement('td');
			let del = document.createElement('input');
			del.type = 'button';
			del.value = 'Delete';
			del.addEventListener('click', (event) => {
				if( confirm('Do you really want to delete this category?') ){
					game.removeCategory(category.id);
					Game.dbDeleteCategory(category.id);
					this.showCategoryBrowser();
				}
			});
			td.append(del);

			let ex = document.createElement('input');
			ex.type = 'button';
			ex.value = 'Export';
			ex.addEventListener('click', (event) => {
				
				const blob = new Blob([JSON.stringify(category.dump())], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				let name = category.name.replace(/[^A-Z0-9]/ig, "_");
				a.download = 'JeopardyCategory_'+name+'.json';
				a.click();
				URL.revokeObjectURL(url);

			});
			td.append(ex);

			tr.append(td);

		}


		this.modalContent.replaceChildren(...elements);
		this.toggleModal(true);

	}

	// Category may also be the this.game, in which case we edit the final question (questionHint should be supplied)
	showQuestionEditor( category, question, questionHint = '' ){

		const isFinalQuestion = category instanceof Game;
		if( !(category instanceof Category) && !isFinalQuestion ){
			console.warn("Object in following error:", category);
			throw new Error("showQuestionEditor called with non-Category object");
		}
		if( !(question instanceof Question) )
			throw new Error("showQuestionEditor called with non-Question object");

		const game = this.game;
		let elements = [], span;

		if( isFinalQuestion ){

			span = document.createElement('span');
			span.innerText = 'Question Category: ';
			elements.push(span);

			elements.push(document.createElement('br'));

			let cInput = document.createElement('input');
			cInput.name = 'category';
			cInput.value = questionHint;
			elements.push(cInput);
			cInput.addEventListener('input', () => {
				
				clearTimeout(cInput._save);
				game.finalQuestionCategory = cInput.value.trim();
				game.save();
				this.renderStatus();
					
			});
			elements.push(document.createElement('br'));

		}

		span = document.createElement('span');
		span.innerText = 'Question: ';
		elements.push(span);
		let qInput = document.createElement('textarea');
		qInput.name = 'question';
		qInput.value = question.question;
		elements.push(qInput);
		qInput.addEventListener('input', () => {
			
			clearTimeout(qInput._save);
			question.question = qInput.value.trim();

			if( isFinalQuestion ){
				game.save();
				this.renderStatus();
			}
			else
				qInput._save = setTimeout(() => {
					Game.dbSaveCategory(category);
					this.draw();
				}, 500);
				
		});

		span = document.createElement('span');
		span.innerText = 'Answer: ';
		elements.push(span);
		let aInput = document.createElement('textarea');
		aInput.name = 'answer';
		aInput.value = question.answer;
		elements.push(aInput);

		aInput.addEventListener('input', () => {
			
			clearTimeout(aInput._save);
			question.answer = aInput.value.trim();
			if( category instanceof Game ){
				game.save();
				this.renderStatus();
			}
			else
				aInput._save = setTimeout(() => {
					Game.dbSaveCategory(category);
					this.draw();
				}, 500);
			
		});

		this.modalContent.replaceChildren(...elements);

		this.toggleModal(true);

	}


	// Show the question in game
	toggleQuestion( question, answered = false ){
		
		if( !(question instanceof Question) ){
			this.question.classList.toggle("disabled", true);
			return;
		}
		
		const questionDiv = this.board.querySelector('div[data-id=\''+question.id+'\']');
		let left = 0, top = 0;
		// Get center of question div in window coordinates
		if( questionDiv ){
			const rect = questionDiv.getBoundingClientRect();
			left = rect.left + rect.width/2;
			top = rect.top + rect.height/2;
		}

		this.questionContent.classList.toggle('noTransition', true);
		// Convert to percent
		this.questionContent.style.left = left/window.innerWidth * 100 + '%';
		this.questionContent.style.top = top/window.innerHeight * 100 + '%';
		
		this.questionText.innerText = answered ? question.answer : question.question;
		this.toggleQuestionActive(false);

		setTimeout(() => {
			this.questionContent.classList.toggle('noTransition', false);
			this.questionContent.style.top = '50%';
			this.questionContent.style.left = '50%';
			this.question.classList.toggle("disabled", false);
		}, 50);
		

	}

	setQuestionTimeLeft( timeLeft, max = 6 ){

		// First make sure we have enough divs
		for( let i = this.questionTimer.children.length; i < max; ++i ){
			this.questionTimer.append(document.createElement('div'));
		}

		// Hide if we have too many
		for( let i = 0; i < this.questionTimer.children.length; ++i ){
			this.questionTimer.children[i].classList.toggle('hidden', i >= max);
		}
		
		for( let i = 0; i < max; ++i ){
			this.questionTimer.children[i].classList.toggle('disabled', i+1 > timeLeft);
		}


	}

	// Whether a team has buzzed in or not. If team is not a Team, the set inactive
	toggleQuestionActive( team ){

		this.setQuestionTimeLeft(0,0);
		this.questionContent.classList.toggle('active', Boolean(team));
		if( !team ){
			this.questionTeam.innerText = '';
			this.questionContent.classList.remove(...Constants.BUTTON_ENUM);
		}

		if( team instanceof Team ){
			this.questionTeam.innerText = team.name;
			this.questionContent.classList.add(team.getColorLabel());
		}

	}


	setControls(...controls){

		console.log("Setting controls", controls);
		let elements = [];
		for( let i = 0; i < controls.length; ++i ){
			const li = document.createElement('li');
			li.innerText = controls[i];
			elements.push(li);
		}
		this.controls.replaceChildren(...elements);

	}



};
