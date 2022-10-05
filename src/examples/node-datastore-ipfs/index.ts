import { Author, Book } from "./BooksModel.js"
import { Repository } from "./BooksTypes.js"
import { DataStore } from "../../datastore/ipfs/index.js"

let datastore = new DataStore(Repository)
let author = datastore.manager.persist(new Author())
author.firstname = "Douglas"
author.lastname = "Adams"
let book = datastore.manager.persist(new Book())
book.title = "Hitchhiker's Guide to the Universe"
book.author = author
await datastore.manager.flush()
console.info(`Book stored as DAG node: ${datastore.manager.transaction().key(book)}`) // bafyreigdxkpaqxkmdfxfgdo6dbma2qdv73rquwnq6vfun2zoquwqyhzv5e