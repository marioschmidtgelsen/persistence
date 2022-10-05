export class Author {
    firstname: string = ""
    lastname: string = ""
    get fullname() {
        return this.lastname && this.lastname.length && this.firstname && this.firstname.length
                ? this.lastname!.concat(", ").concat(this.firstname!)
                : this.lastname && this.lastname.length
                    ? this.lastname
                    : this.firstname
        }
}
export class Book {
    title: string = ""
    author?: Author = undefined
}
