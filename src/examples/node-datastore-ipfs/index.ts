import { Author, Book } from "./BooksModel.js"
import { Repository } from "./BooksTypes.js"
import { DataStore } from "../../datastore/ipfs/index.js"

let datastore = new DataStore(Repository)
{
    let author = datastore.manager.persist(new Author())
    author.firstname = "Douglas"
    author.lastname = "Adams"
    let book = datastore.manager.persist(new Book())
    book.title = "Hitchhiker's Guide to the Universe"
    book.author = author
    await datastore.manager.flush()
    console.info(`Book stored as DAG node: ${datastore.manager.transaction().key(book)}`) // bafyreiftf6ezielotf46den32naywudczeemlxqfzyzoplxzzwfsj2hy4y
}
{
    const key = "bafyreiftf6ezielotf46den32naywudczeemlxqfzyzoplxzzwfsj2hy4y"
    let book = await datastore.manager.find(Book, key)
    console.info(`Book loaded from DAG node: ${key}`)
    let fullname = book.author?.fullname
    debugger
}